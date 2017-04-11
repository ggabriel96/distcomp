import { Message, RequestState } from "./Classes";

import * as ip from "ip";
import * as express from "express";
import * as winston from "winston";
import * as request from "request";
import * as minimist from "minimist";
import * as hamsters from "hamsters.js";
import * as bodyParser from "body-parser";

const threads: number = 1;
const defaultPort: number = 1975;
const defaultTimeout: number = 10000;
const ipAddress: string = ip.address();
const app: express.Application = express();
const argv = minimist(process.argv.slice(2));
const logger: winston.LoggerInstance = new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: 'silly'
    })
  ]
});

let messages: Message[] = [];
let aliveServers: Set<string> = new Set();

let port: number | undefined = argv.port || argv.p;
let timeout: number | undefined = argv.timeout || argv.t;
let servers: string | string[] | undefined = argv.server || argv.s;

logger.debug("Provided command-line arguments:");
logger.debug(JSON.stringify(argv));

if (port === undefined) {
  port = defaultPort;
  logger.info("No port argument provided, using the default of " + defaultPort + ".");
}

if (timeout === undefined) {
  timeout = defaultTimeout;
  logger.info("No timeout argument provided, using the default of " + defaultTimeout + ".");
}

let pingState: RequestState = RequestState.IDLE;
let pingOptions: request.OptionsWithUrl = {
  url: "/ping",
  method: "POST",
  json: true,
  headers: {
    "port": port
  }
};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/message/incoming", receiveMessage);

app.post("/message/new", (request: express.Request, response: express.Response): void => {
  let message: Message = new Message(request.body.user, request.body.content);
  try {
    receiveMessage(message);
    response.send(message);
  } catch (e) {
    logger.error(e.toString());
    response.send(e.toString());
  }
});

app.get("/message/list", (request: express.Request, response: express.Response): void => {
  response.send(messages);
});

app.post("/ping", (request: express.Request, response: express.Response): void => {
  let address = "http://" + request.hostname + ":" + request.header("port");
  logger.debug("Received ping from '" + address + "'. Adding it to known alive servers...");
  aliveServers.add(address);
  response.send();
});

app.get("/", (request: express.Request, response: express.Response): void => {
  response.send("Hello, world!");
});

app.listen(port, (): void => {
  logger.info("Server listening on http://" + ipAddress + ":" + port);
  if (servers !== undefined) addAll(servers);
});

setInterval(messageAlive, timeout, pingOptions, pingState, removeFromAlive);

function messageAlive(options: request.OptionsWithUrl, state?: RequestState, onError?: (error: any, response: request.RequestResponse, body: any) => void): void {
  if (state !== undefined && state !== RequestState.IDLE) {
    logger.warn("requestAlive called with a state that's not IDLE, returning...");
    return;
  }
  if (aliveServers === undefined || aliveServers.size === 0) {
    logger.debug("No known alive servers, returning...");
    return;
  }
  logger.debug("Starting requestAlive process...");
  printAliveServers();
  if (state !== undefined) state = RequestState.INIT;
  let params = {
    "servers": aliveServers
  };
  hamsters.run(params, (): void => {
    rtn.data = Array.from(params.servers);
  }, (output: any): void => {
    doRequest(options, output[0], state, onError);
  }, threads, false);
}

function doRequest(options: request.OptionsWithUrl, servers: string[], state?: RequestState, onError?: (error: any, response: request.RequestResponse, body: any) => void): void {
  if (state !== undefined && state === RequestState.BUSY) {
    logger.warn("doRequest called with a BUSY state, returning...");
    return;
  }
  if (servers === undefined || servers.length === 0) {
    logger.warn("doRequest called with undefined or empty servers array, returning...");
    return;
  }
  logger.debug("Starting doRequest process...");
  if (state !== undefined) state = RequestState.BUSY;
  let params = {
    "servers": servers
  };
  hamsters.run(params, (): void => {
    let servers: string[] = params.servers;
    for (let i = 0; i < servers.length; i++) {
      options.baseUrl = servers[i];
      logger.debug("Sending request with options: " + JSON.stringify(options));
      request(options, (error: any, response: request.RequestResponse, body: any) => {
        if (error !== null || response.statusCode !== 200) {
          logger.error(error);
          if (response !== undefined) logger.error(JSON.stringify(response));
          if (onError !== undefined) onError.call(onError, error, response, body);
        }
      });
    }
  }, (output: any): void => {
    state = RequestState.IDLE;
    logger.debug("Stopping doRequest process...");
  }, threads, false);
}

function receiveMessage(message: Message): void {
  if (message.isValid()) {
    logger.debug("Received message: " + message);
    messages.push(message);
  } else {
    throw new TypeError("Invalid message: " + message);
  }
}

function removeFromAlive(error: any, response: request.RequestResponse, body: any): void {
  let server: string = "http://" + error.address + ":" + error.port;
  logger.error("Removing '" + server + "' from known alive servers...");
  aliveServers.delete(server);
}

function fixAddresses(servers: string[]): string[] {
  let fixedServers: string[] = [];
  for (let i = 0; i < servers.length; i++)
    fixedServers.push(fixAddress(servers[i]));
  return fixedServers;
}

function fixAddress(address: string): string {
  let fixedAddress: string = address;
  const portRegExp: RegExp = new RegExp("\\:\\d+");
  logger.debug("fixAddress(" + address + ")");
  if (!address.startsWith("http://")) {
    logger.debug("Prepending 'http://' to server address '" + address + "'.");
    fixedAddress = "http://" + fixedAddress;
  }
  if (address.search(portRegExp) === -1) {
    logger.debug("No port specified for address '" + address + "', using the default of " + defaultPort + ".");
    fixedAddress += ":" + defaultPort;
  }
  return fixedAddress;
}

function printAliveServers(): void {
  logger.debug("Current known alive servers:");
  for (let server of aliveServers) logger.debug(server);
}

function addAll(servers: string | string[]): void {
  logger.debug("addAll(" + JSON.stringify(servers) + ")");
  if (typeof servers === "string") servers = [servers];
  for (let i = 0; i < servers.length; i++) {
    let server: string = fixAddress(servers[i]);
    logger.debug("Adding '" + server + "' to known alive servers...");
    aliveServers.add(server);
  }
}
