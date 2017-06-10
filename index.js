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
    var peer = subtopics[3];

    if (message == 'create or join') {
        log(room, peer, 'Received request to create or join room ' + room);
        log(room, peer, 'Room ' + room + ' now has ' + numPeers + ' peer(s)');

        switch (numPeers) {
            case 0:
                ++numPeers;
                log(room, peer, 'Peer name ' + peer + ' created room ' + room);
                response(room, peer, 'created');
                break;
            case 1:
                log('Peer name ' + peer + ' joined room ' + room);
                broadcast(room, 'join');
                ++numPeers;
                response(room, peer, 'joined');
                // io.sockets.in(room).emit('ready');
                break;
            case 2:
                response(room, peer, 'full');
                break;
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

// socket.on('message', function(message) {
//     log('Client said: ', message);
//     // for a real app, would be room-only (not broadcast)
//     socket.broadcast.emit('message', message);
// });

// socket.on('ipaddr', function() {
//     var ifaces = os.networkInterfaces();
//     for (var dev in ifaces) {
//         ifaces[dev].forEach(function(details) {
//             if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
//                 socket.emit('ipaddr', details.address);
//             }
//         });
//     }
// });
