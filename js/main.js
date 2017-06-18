'use strict';

var isChannelReady = false;
var isInitiator = false;
var isJoined = false;
var localStream;
var pcs = [];
var remoteStreams = [];
var turnReady;

var pcConfig = {
  'iceServers': [{
    'url': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
// var sdpConstraints = {
//   offerToReceiveAudio: true,
//   offerToReceiveVideo: true
// };

/////////////////////////////////////////////

// Could prompt for room name:
var room = prompt('Enter room name:');
var peer = prompt('Enter your name:');

var client = mqtt.connect('ws://192.168.0.120:1884');

client.subscribe('room/' + room + '/response/' + peer);
client.subscribe('room/' + room + '/peer/' + peer + '/log');
client.on('message', mqttOnMessage);

if (room !== '') {
  request(room, peer, 'create or join');
  console.log('Attempted to create or join room', room);
}

///////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideos = [
    document.querySelector('#remoteVideo1'),
    document.querySelector('#remoteVideo2'),
    document.querySelector('#remoteVideo3')
];
var constraints = {
  audio: false,
  video: true
};

console.log('Getting user media with constraints', constraints);

navigator.mediaDevices.getUserMedia(constraints)
.then(gotStream)
.catch(function(e) {
  alert('getUserMedia() error: ' + e.name);
});

if (location.hostname !== 'localhost') {
  requestTurn(
    'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
  );
}

window.onbeforeunload = function(e) {
    sendMessage(room, {msg: 'bye', peerName: peer});
    client.end();
};


function gotStream(stream) {
    console.log('Adding local stream.');
    localVideo.src = window.URL.createObjectURL(stream);
    localStream = stream;

    if (isJoined)
        sendMessage(room, {msg: 'got user media', peerName: peer});

}

function request(room, peer, evt) {
    client.publish('room/' + room + '/request/' + peer, evt);
}

function mqttOnMessage(topic, message) {
    // console.log(topic, message);
    var subtopics = topic.split('/');

    if (message.toString() === 'created') {
        client.subscribe('room/' + room + '/+');
        console.log('Created room ' + room);
        isJoined = true;

        if (typeof localStream !== 'undefined')
            sendMessage(room, {msg: 'got user media', peerName: peer});
    } else if (message.toString() === 'joined') {
        client.subscribe('room/' + room + '/+');
        console.log('joined: ' + room);
        isChannelReady = true;
        isJoined = true;

        if (typeof localStream !== 'undefined')
            sendMessage(room, {msg: 'got user media', peerName: peer});
    } else if (message.toString() === 'join') {
        console.log('Another peer made a request to join room ' + room);
        console.log('This peer is the initiator of room ' + room + '!');
        isChannelReady = true;
    // } else if (message.toString() === 'full') {
    //     console.log('Room ' + room + ' is full');
    } else if (subtopics[2] === 'message') {
        var msgObj = JSON.parse(message);
        console.log('Client received message:', msgObj);

        if (msgObj.peerName !== peer) {
            if (msgObj.msg === 'got user media') {
                isInitiator = true;
                var pc = createPeerConnection(msgObj.peerName);

                if (pc !== null) {
                    pc.addStream(localStream);
                    doCall(pc);
                }
            } else if (msgObj.type === 'offer' && !isInitiator) {
                console.log('got offer');
                var pc = createPeerConnection(msgObj.peerName);

                if (pc !== null) {
                    pc.addStream(localStream);
                    pc.setRemoteDescription(new RTCSessionDescription(msgObj));
                    doAnswer(pc);
                }
            } else if (msgObj.type === 'answer' && isInitiator) {
                for (var pc of pcs) {
                    if (pc.peerName === msgObj.peerName &&
                        (!pc.remoteDescription || !pc.remoteDescription.sdp)) {
                        console.log('got answer');
                        pc.setRemoteDescription(new RTCSessionDescription(msgObj));
                        break;
                    }
                }
            } else if (msgObj.type === 'candidate') {
                var candidate = new RTCIceCandidate({
                    sdpMLineIndex: msgObj.label,
                    candidate: msgObj.candidate
                });

                for (var pc of pcs) {
                    if (pc.peerName === msgObj.peerName) {
                        pc.addIceCandidate(candidate);
                        console.log('Adding candidate');
                        break;
                    }
                }
            } else if (msgObj.msg === 'bye') {
                handleRemoteHangup(msgObj.peerName);
            }
        }
    } else if (subtopics[4] === 'log') {
            console.log(message.toString());
    }
}

function sendMessage(room, message) {
    console.log('Client sending message: ', message);
    // console.log(JSON.parse(JSON.stringify(message)));
    client.publish('room/' + room + '/message', JSON.stringify(message));
}

// function maybeStart(peerName) {
//     console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);

//     if ([> !isStarted &&  <]typeof localStream !== 'undefined' && isChannelReady) {
//         console.log('>>>>>> creating peer connection');
//         var pc = createPeerConnection(peerName);

//         if (pc === null)
//             return null;

//         pc.addStream(localStream);
//         isStarted = true;
//         console.log('isInitiator', isInitiator);
//         if (isInitiator) {
//             doCall(pc);
//         }

//         return pc;
//     }

//     return null;
// }

function createPeerConnection(peerName) {
    console.log('>>>>>>> maybeStart() ', localStream, isChannelReady);
    if (typeof localStream === 'undefined')
        return null;

    try {
        console.log('>>>>>> creating peer connection');
        var pc = new RTCPeerConnection(null);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        pc.peerName = peerName;
        pcs.push(pc);
        console.log('Created RTCPeerConnnection');

        return pc;
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
    }

    // console.log('All PCs are full!');
    return null;
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage(room, {
        type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate,
        peerName: peer
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    var cnt = 0;
    for (var remoteVideo of remoteVideos) {
        if (!remoteVideo.src) {
            remoteVideo.src = window.URL.createObjectURL(event.stream);
            remoteStreams[cnt] = event.stream;
            break;
        }
        ++cnt;
    }
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function doCall(pc) {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doAnswer(pc) {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
    // Set Opus as the preferred codec in SDP if Opus is present.
    //  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
    for (var pc of pcs) {
        // console.log('SetLocalAndSendMessage, pc: ', pc);
        // console.log('SetLocalAndSendMessage, pc.localDescription.sdp: ', pc.localDescription.sdp);
        if (!pc.localDescription || !pc.localDescription.sdp) {
            pc.setLocalDescription(sessionDescription);
            var data = JSON.parse(JSON.stringify(sessionDescription));
            data.peerName = peer;
            console.log('setLocalAndSendMessage sending message', data);
            sendMessage(room, data);

            break;
        }
    }
}

function onCreateSessionDescriptionError(error) {
  console.trace('Failed to create session description: ' + error.toString());
}

function handleRemoteHangup(peerName) {
    console.log('Session terminated.');
    stop(peerName);
    isInitiator = false;
}

function stop(peerName) {
    // isStarted = false;
    // isAudioMuted = false;
    // isVideoMuted = false;
    for (var pc of pcs) {
        if (pc.peerName === peerName) {
            pc.close();
            pc = null;
            break;
        }
    }
}

function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

// // Set Opus as the default audio codec if it's present.
// function preferOpus(sdp) {
//   var sdpLines = sdp.split('\r\n');
//   var mLineIndex;
//   // Search for m line.
//   for (var i = 0; i < sdpLines.length; i++) {
//     if (sdpLines[i].search('m=audio') !== -1) {
//       mLineIndex = i;
//       break;
//     }
//   }
//   if (mLineIndex === null) {
//     return sdp;
//   }

//   // If Opus is available, set it as the default in m line.
//   for (i = 0; i < sdpLines.length; i++) {
//     if (sdpLines[i].search('opus/48000') !== -1) {
//       var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
//       if (opusPayload) {
//         sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex],
//           opusPayload);
//       }
//       break;
//     }
//   }

//   // Remove CN in m line and sdp.
//   sdpLines = removeCN(sdpLines, mLineIndex);

//   sdp = sdpLines.join('\r\n');
//   return sdp;
// }

// function extractSdp(sdpLine, pattern) {
//   var result = sdpLine.match(pattern);
//   return result && result.length === 2 ? result[1] : null;
// }

// // Set the selected codec to the first in m line.
// function setDefaultCodec(mLine, payload) {
//   var elements = mLine.split(' ');
//   var newLine = [];
//   var index = 0;
//   for (var i = 0; i < elements.length; i++) {
//     if (index === 3) { // Format of media starts from the fourth.
//       newLine[index++] = payload; // Put target payload to the first.
//     }
//     if (elements[i] !== payload) {
//       newLine[index++] = elements[i];
//     }
//   }
//   return newLine.join(' ');
// }

// // Strip CN from sdp before CN constraints is ready.
// function removeCN(sdpLines, mLineIndex) {
//   var mLineElements = sdpLines[mLineIndex].split(' ');
//   // Scan from end for the convenience of removing an item.
//   for (var i = sdpLines.length - 1; i >= 0; i--) {
//     var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
//     if (payload) {
//       var cnPos = mLineElements.indexOf(payload);
//       if (cnPos !== -1) {
//         // Remove CN payload from m line.
//         mLineElements.splice(cnPos, 1);
//       }
//       // Remove CN line in sdp
//       sdpLines.splice(i, 1);
//     }
//   }

//   sdpLines[mLineIndex] = mLineElements.join(' ');
//   return sdpLines;
/* } */
