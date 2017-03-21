"use strict";
exports.__esModule = true;
var express = require("express");
var app = express();
var port = 1975;
app.get("/", function (request, response) {
    response.send("Hello, world!");
});
app.listen(port, function () {
    console.log("Server listening on port " + port);
});
