import { Message } from "./Classes";

import * as ip from "ip";
import * as express from "express";
import * as winston from "winston";
import * as request from "request";
import * as minimist from "minimist";
import * as hamsters from "hamsters.js";
import * as bodyParser from "body-parser";

const threads: Number = 1;
const defaultPort: Number = 1975;
const defaultTimeout: Number = 10000;
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
let servers: Set<String> = new Set();
let port: Number = argv.port || argv.p;
let timeout: Number = argv.timeout || argv.t;

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

if (argv.servers !== undefined) checkAlive(argv.servers);
setInterval(checkServers, timeout);

function checkServers() {
  // convert Set to [] in a thread
  // then call checkAlive
}

function checkAlive(array: String[]) {
  // let params = {
  //   "array": array
  // };
  // hamsters.run(params, () => {
  //   let array = params.array;
  //   for (let i = 0; i < array.length; i++) {
  //     let address = array[i];
  //     let url = "http://" + address;
  //     if (address.indexOf(":") < 0) {
  //       logger.warning("No port..."); // improve this
  //       url += ":" + defaultPort;
  //     }
  //   }
  // }, (output) => {

  // }, threads, false);
}

