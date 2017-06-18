'use strict';

// var os = require('os');
var nodeStatic = require('node-static');
var http = require('http');
var mqtt = require('mqtt');
var client = mqtt.connect('mqtt://localhost')
var numPeers = 0;

var fileServer = new(nodeStatic.Server)();
var app = http.createServer(function(req, res) {
    fileServer.serve(req, res);
}).listen(8080);

client.on('connect', mqttOnConnect);
client.on('message', mqttOnMessage);

function mqttOnConnect() {
    client.subscribe('room/+/request/+');
    console.log('Connected to MQTT broker');
}

function mqttOnMessage(topic, message) {
    console.log(topic + ': |' + message + '|');
    var subtopics = topic.split('/');
    var room = subtopics[1];

    if (subtopics[2] === 'request') {
        var peer = subtopics[3];

        if (message.toString() === 'create or join') {
            log(room, peer, 'Received request to create or join room ' + room);
            log(room, peer, 'Room ' + room + ' now has ' + numPeers + ' peer(s)');
            client.subscribe('room/' + room + '/message');

            if (numPeers > 0) {
                log('Peer name ' + peer + ' joined room ' + room);
                ++numPeers;
                // console.log(numPeers);
                broadcast(room, 'join');
                response(room, peer, 'joined');
                    // io.sockets.in(room).emit('ready');
            } else {
                log(room, peer, 'Peer name ' + peer + ' created room ' + room);
                ++numPeers;
                // console.log(numPeers);
                response(room, peer, 'created');
            }
                // response(room, peer, 'full');
        }
    } else if (subtopics[2] === 'message') {
        var msgObj = JSON.parse(message);

        if (msgObj.msg === 'bye') {
            --numPeers;
            log(room, peer, 'Peer name ' + msgObj.peerName + ' leaving room ' + room);
            log(room, peer, 'Room ' + room + ' now has ' + numPeers + ' peer(s)');
        }
    } else {
            console.log('some message not matched');
    }
}

function broadcast(room, evt) {
    client.publish('room/' + room + '/peer', evt);
}

function response(room, peer, evt) {
    client.publish('room/' + room + '/response/' + peer, evt);
}

function log(room, peer, message) {
    message = 'Message from server:' + message;
    client.publish('room/' + room +'/peer/' + peer + '/log', message);
}
