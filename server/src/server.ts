import { Message, RequestState } from "./Classes";

import * as ip from "ip";
import * as express from "express";
import * as winston from "winston";
import * as request from "request";
import * as minimist from "minimist";
import * as hamsters from "hamsters.js";
import * as bodyParser from "body-parser";
import { IDs, Occurrences, Stamp } from "itclocks";
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

const port: number = argv.port || argv.p || defaultPort;
const timeout: number = argv.timeout || argv.t || defaultTimeout;

let stamp: Stamp = new Stamp();
let aliveServers: Set<string> = new Set();
let servers: string | string[] | undefined = argv.server || argv.s;
let messages: SortedSet<Message> = new SortedSet<Message>(null, Message.equals, Message.compare);

logger.debug("Provided command-line arguments: " + JSON.stringify(argv));

let requestState: RequestState = RequestState.IDLE;
const pingOptions: request.OptionsWithUrl = {
  "url": "/ping",
  "method": "POST",
  "json": true,
  "body": {
    "ip": ipAddress,
    "port": port
  }
};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/message/new/from/:origin", (request: express.Request, response: express.Response): void => {
  try {
    let message: Message = receiveMessage(request.body);
    logger.verbose("New message from " + request.params.origin);
    logger.verbose("Message is: " + message);
    logger.verbose("New stamp: " + stamp.toString());
    if (request.params.origin === "client") spreadNewMessage(message);
    response.send(true);
  } catch (e) {
    logger.error(e.toString());
    response.send(false);
  }
});

app.get("/message/list", (request: express.Request, response: express.Response): void => {
  response.send(messages);
});

app.post("/ping", (request: express.Request, response: express.Response): void => {
  let address = "http://" + request.body.ip + ":" + request.body.port;
  logger.verbose("Received ping from '" + address + "'");
  if (addServer(address)) logger.verbose("Adding it to known alive servers...");
  response.send();
});

app.get("/fork", (request: express.Request, response: express.Response): void => {
  let address = "http://" + request.body.ip + ":" + request.body.port;
  logger.info("Received fork request from " + address);
  let fork: Stamp[] = stamp.fork();
  stamp = fork[0];
  logger.info("New stamp: " + stamp.toString());
  response.send({
    "stamp": fork[1].toJSON(),
    "messages": messages
  });
  let spreadOptions: request.OptionsWithUrl = {
    "url": "/ping",
    "method": "POST",
    "json": true,
    "body": {
      "ip": request.body.ip,
      "port": request.body.port
    }
  };
  logger.info("Preparing to spread server...");
  messageAlive(spreadOptions, false);
});

app.get("/", (request: express.Request, response: express.Response): void => {
  response.send("Hello, world!");
});

app.listen(port, (): void => {
  logger.info("Server listening on http://" + ipAddress + ":" + port + " with a threading timer of " + timeout + " ms.");
  if (servers !== undefined) {
    addAll(servers);
    requestFork();
  }
});

setInterval(messageAlive, timeout, pingOptions, false, undefined, removeFromAlive);

function messageAlive(options: request.OptionsWithUrl,
  stopOnFirstSuccess: boolean,
  onIterSuccess?: (error: any, response: request.RequestResponse, body: any) => void,
  onIterError?: (error: any, response: request.RequestResponse, body: any) => void): void {
  if (requestState as RequestState !== RequestState.IDLE) {
    logger.warn("messageAlive called with a RequestState that's not IDLE, returning...");
    return;
  }
  if (aliveServers === undefined || aliveServers.size === 0) {
    logger.debug("No known alive servers, returning...");
    return;
  }
  logger.debug("Starting messageAlive process...");
  requestState = RequestState.INIT;
  let params = {
    "servers": aliveServers
  };
  hamsters.run(params, (): void => {
    rtn.data = Array.from(params.servers);
    logger.debug("Current known alive servers: " + rtn.data);
  }, (output: any): void => {
    if (stopOnFirstSuccess) doWaitingRequest(options, output[0], 0, onIterSuccess);
    else doRequest(options, output[0], onIterSuccess, onIterError);
  }, threads, false);
}

function doWaitingRequest(options: request.OptionsWithUrl,
  servers: string[],
  index: number,
  onIterSuccess?: (error: any, response: request.RequestResponse, body: any) => void): void {
  requestState = RequestState.BUSY;
  if (index < servers.length) {
    doRequest(options, [servers[index]],
      (error: any, response: request.RequestResponse, body: any): void => {
        requestState = RequestState.IDLE;
        if (onIterSuccess !== undefined) onIterSuccess.call(onIterSuccess, error, response, body);
      },
      (error: any, response: request.RequestResponse, body: any): void => {
        logger.debug("doWaitingRequest failed, trying again with index " + (index + 1) + "...");
        doWaitingRequest(options, servers, index + 1);
      });
  } else if (index === servers.length) requestState = RequestState.IDLE;
}

/**
 * @todo add another callback that will be called at the end of the thread run
 * (before going back to IDLE state)
 */
function doRequest(options: request.OptionsWithUrl,
  servers: string[],
  onIterSuccess?: (error: any, response: request.RequestResponse, body: any) => void,
  onIterErr?: (error: any, response: request.RequestResponse, body: any) => void): void {
  logger.debug("Starting doRequest process...");
  requestState = RequestState.BUSY;
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
    requestState = RequestState.IDLE;
    logger.debug("Stopping doRequest process...");
  }, threads, false);
}

function addServer(address: string): boolean {
  if (!aliveServers.has(address)) {
    aliveServers.add(address);
    return true;
  }
  return false
}

function receiveMessage(json: any): Message {
  let messageStamp: Stamp;
  // Message from a client
  if (json.stamp === undefined) {
    messageStamp = new Stamp(IDs.zero(), stamp.event().occurrence);
    logger.verbose("Received a message without a stamp; message stamp is: " + messageStamp.toString());
  } else {
    // Message from another server
    messageStamp = new Stamp(IDs.zero(), Occurrences.fromString(json.stamp.occurrence));
    logger.verbose("Received a message with stamp: " + messageStamp.toString());
  }
  // stamp = stamp.receive(messageStamp);
  // Does not invoke receive() because that would
  // increment the current occurrence again and
  // this doesn't seem right. Joining the occurrences
  // is just the first step of receive(), whereas
  // event() is the second one.
  stamp = new Stamp(stamp.id, stamp.occurrence.join(messageStamp.occurrence));
  let message: Message = new Message(json.user, json.content, messageStamp);
  messages.push(message);
  return message;
}

function spreadNewMessage(message: Message): void {
  logger.debug("Preparing to spread message...");
  let messageOptions: request.OptionsWithUrl = {
    "url": "/message/new/from/server",
    "method": "POST",
    "json": true,
    "headers": {
      "port": port
    },
    "body": message
  };
  messageAlive(messageOptions, false);
}

function removeFromAlive(error: any, response: request.RequestResponse, body: any): void {
  let server: string = "http://" + error.address + ":" + error.port;
  logger.info("Removing '" + server + "' from known alive servers...");
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

function addAll(servers: string | string[]): void {
  logger.debug("addAll(" + JSON.stringify(servers) + ")");
  if (typeof servers === "string") servers = [servers];
  for (let i = 0; i < servers.length; i++) {
    let server: string = fixAddress(servers[i]);
    logger.debug("Adding '" + server + "' to known alive servers...");
    aliveServers.add(server);
  }
}

function requestFork(): void {
  let options: request.OptionsWithUrl = {
    "url": "/fork",
    "method": "GET",
    "json": true,
    "body": {
      "ip": ipAddress,
      "port": port
    }
  };
  messageAlive(options, true, (error: any, response: request.RequestResponse, body: any): void => {
    logger.info("Fork request succeeded.");
    stamp = Stamp.fromString(body.stamp.id, body.stamp.occurrence);
    logger.info("New stamp: " + stamp.toString());
    try {
      for (let message of body.messages) receiveMessage(message);
    } catch (e) {
      logger.error(e.toString());
    }
  });
}
