import { Message, RequestState } from "./Classes";

import * as ip from "ip";
import { IDs } from "itclocks";
import { Occurrences } from "itclocks";
import { Stamp } from "itclocks";
import * as express from "express";
import * as winston from "winston";
import * as request from "request";
import * as minimist from "minimist";
import * as hamsters from "hamsters.js";
import * as bodyParser from "body-parser";
import SortedSet = require("collections/sorted-set");

hamsters.init({
  maxThreads: 2
});

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

let messages: SortedSet<Message> = new SortedSet<Message>(null, Message.equals, Message.compare);
let aliveServers: Set<string> = new Set();

let stamp: Stamp = new Stamp();
let port: number | undefined = argv.port || argv.p;
let timeout: number | undefined = argv.timeout || argv.t;
let servers: string | string[] | undefined = argv.server || argv.s;

logger.debug("Provided command-line arguments: " + JSON.stringify(argv));

if (port === undefined) port = defaultPort;
if (timeout === undefined) timeout = defaultTimeout;

let pingState: RequestState = RequestState.IDLE;
let pingOptions: request.OptionsWithUrl = {
  "url": "/ping",
  "method": "POST",
  "json": true,
  "headers": {
    "port": port
  }
};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/message/incoming", (request: express.Request, response: express.Response): void => {
  receiveClientMessage(request, response, false);
});

app.post("/message/new", (request: express.Request, response: express.Response): void => {
  receiveClientMessage(request, response, true);
});

app.get("/message/list", (request: express.Request, response: express.Response): void => {
  response.send(messages);
});

app.post("/ping", (request: express.Request, response: express.Response): void => {
  let address = "http://" + request.hostname + ":" + request.header("port");
  logger.debug("Received ping from '" + address);
  if (!aliveServers.has(address)) {
    logger.debug("Adding it to known alive servers...");
    aliveServers.add(address);
  }
  response.send();
});

app.get("/", (request: express.Request, response: express.Response): void => {
  response.send("Hello, world!");
});

app.listen(port, (): void => {
  logger.info("Server listening on http://" + ipAddress + ":" + port + " with a threading timer of " + timeout + " ms.");
  if (servers !== undefined) {
    addAll(servers);
    syncMessages();
  }
});

setInterval(messageAlive, timeout, pingOptions, pingState, removeFromAlive);

function messageAlive(options: request.OptionsWithUrl,
  state?: RequestState,
  onError?: (error: any, response: request.RequestResponse, body: any) => boolean,
  onSuccess?: (error: any, response: request.RequestResponse, body: any) => boolean): void {
  if (state !== undefined && state !== RequestState.IDLE) {
    logger.warn("messageAlive called with a state that's not IDLE, returning...");
    return;
  }
  if (aliveServers === undefined || aliveServers.size === 0) {
    logger.debug("No known alive servers, returning...");
    return;
  }
  logger.debug("Starting messageAlive process...");
  if (state !== undefined) state = RequestState.INIT;
  let params = {
    "servers": aliveServers
  };
  hamsters.run(params, (): void => {
    rtn.data = Array.from(params.servers);
    logger.debug("Current known alive servers: " + rtn.data);
  }, (output: any): void => {
    doRequest(options, output[0], state, onError, onSuccess);
  }, threads, false);
}

/**
 * @todo add another callback that will be called at the end of the thread run
 * (before going back to IDLE state)
 */
function doRequest(options: request.OptionsWithUrl,
  servers: string[],
  requestState?: RequestState,
  onIterErr?: (error: any, response: request.RequestResponse, body: any) => boolean,
  onIterSuccess?: (error: any, response: request.RequestResponse, body: any) => boolean): void {
  if (requestState !== undefined && requestState === RequestState.BUSY) {
    logger.warn("doRequest called with a BUSY state, returning...");
    return;
  }
  if (servers === undefined || servers.length === 0) {
    logger.warn("doRequest called with undefined or empty servers array, returning...");
    return;
  }
  logger.debug("Starting doRequest process...");
  if (requestState !== undefined) requestState = RequestState.BUSY;
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
          if (onIterErr !== undefined) onIterErr.call(onIterErr, error, response, body);
        } else if (onIterSuccess !== undefined) {
          onIterSuccess.call(onIterSuccess, error, response, body);
        }
      });
    }
  }, (output: any): void => {
    if (requestState !== undefined) requestState = RequestState.IDLE;
    logger.debug("Stopping doRequest process...");
  }, threads, false);
}

function receiveClientMessage(request: express.Request, response: express.Response, shouldSpread: boolean): void {
  try {
    let message: Message = receiveMessage(request.body);
    if (shouldSpread) spreadNewMessage(message);
    response.send(true);
  } catch (e) {
    logger.error(e.toString());
    response.send(false);
  }
}

function receiveMessage(json: any): Message {
  stamp = stamp.receive(json.stamp === undefined ? new Stamp(IDs.zero(), stamp.event().occurrence) : Stamp.fromString(json.stamp));
  let message: Message = new Message(json.user, json.content, stamp);
  logger.debug("Received message: " + message);
  messages.push(message);
  return message;
}

function spreadNewMessage(message: Message): void {
  logger.debug("Preparing to spread message...");
  let messageOptions: request.OptionsWithUrl = {
    "url": "/message/incoming",
    "method": "POST",
    "json": true,
    "headers": {
      "port": port
    },
    "body": message
  };
  messageAlive(messageOptions);
}

function removeFromAlive(error: any, response: request.RequestResponse, body: any): boolean {
  let server: string = "http://" + error.address + ":" + error.port;
  logger.error("Removing '" + server + "' from known alive servers...");
  aliveServers.delete(server);
  return true;
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

function addAll(servers: string | string[]): void {
  logger.debug("addAll(" + JSON.stringify(servers) + ")");
  if (typeof servers === "string") servers = [servers];
  for (let i = 0; i < servers.length; i++) {
    let server: string = fixAddress(servers[i]);
    logger.debug("Adding '" + server + "' to known alive servers...");
    aliveServers.add(server);
  }
}

function syncMessages(): void {
  logger.debug("Preparing to sync messages...");
  let syncOptions: request.OptionsWithUrl = {
    "url": "/message/list",
    "method": "GET",
    "json": true,
    "headers": {
      "port": port
    }
  };
  messageAlive(syncOptions, undefined, undefined, (error: any, response: request.RequestResponse, body: any): boolean => {
    try {
      for (let i = 0; i < body.length; i++) receiveMessage(body[i]);
    } catch (e) {
      /**
       * Does not make a lot of sense now, but it's a "try again" placeholder.
       * An error should never happen here, because servers only hold valid
       * messages, but it's preferable to have it not crash anyways...
       */
      logger.error(e.toString());
      return true;
    }
    return false;
  });
}
