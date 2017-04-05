import { Message } from "./Classes";

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

let port: number = argv.port || argv.p;
let timeout: number = argv.timeout || argv.t;
let servers: string[] = argv.server || argv.s;

if (port === undefined) {
  port = defaultPort;
  logger.info("No port argument provided, using the default of " + defaultPort + ".");
}

if (timeout === undefined) {
  timeout = defaultTimeout;
  logger.info("No timeout argument provided, using the default of " + defaultTimeout + ".");
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/messages", (request: express.Request, response: express.Response): void => {
  let message: Message = new Message(request.body.user, request.body.content);
  if (message.isValid()) {
    logger.debug("Received message " + message);
    messages.push(message);
    response.send(message);
  } else {
    logger.debug("Received invalid message " + message)
    response.send();
  }
});

app.get("/messages", (request: express.Request, response: express.Response): void => {
  response.send(messages);
});

app.get("/", (request: express.Request, response: express.Response): void => {
  response.send("Hello, world!");
});

app.listen(port, () => {
  logger.info("Server listening on http://" + ipAddress + ":" + port);
});

if (servers !== undefined) checkAlive(servers);
// setInterval(checkServers, timeout);

function checkServers() {
  // convert Set to [] in a thread
  // then call checkAlive
}

function checkAlive(servers: string[]) {
  let params = {
    "servers": servers
  };
  hamsters.run(params, () => {
    let servers: string[] = fixAddresses(params.servers);
    for (let i = 0; i < servers.length; i++) {
      console.log(servers[i]);
      request(servers[i], (error, response, body) => {
        if (error === null) {
          aliveServers.add(servers[i]);
          // aliveServers.add(response); // servers[i] known alive servers
        } else {
          // log it
        }
      });
    }
  }, (output) => {
  }, threads, false);
}

function fixAddresses(servers: string[]): string[] {
  let fixedServer: string;
  let fixedServers: string[] = [];
  const portRegExp: RegExp = new RegExp("\\:\\d+");
  for (let i = 0; i < servers.length; i++) {
    fixedServer = servers[i];
    if (servers[i].search(portRegExp) === -1) {
      logger.warn("No port specified for server '" + servers[i] + "', using the default of " + defaultPort + ".");
      fixedServer += ":" + defaultPort;
    }
    if (!servers[i].startsWith("http://")) {
      logger.warn("No protocol specified for server '" + servers[i] + "', using http.");
      fixedServer = "http://" + fixedServer;
    }
    fixedServers.push(fixedServer);
  }
  return fixedServers;
}
