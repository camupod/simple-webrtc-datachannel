function EventTarget() {
    var handlers = {};
    this.on = function (type, handler) {
        handlers[type] = handlers[type] || [];
        handlers[type].push(handler);
    };
    this.off = function (type, handler) {
        var i, len,
            typeHandlers = handlers[type];

        if (typeHandlers) {
            // if handler is not specified, remove all 
            // handlers of the given type
            if (!handler) {
                typeHandlers.length = 0;
                return;
            }
            for (i = 0, len = typeHandlers.length; i < len; i++) {
                if (typeHandlers[i] === handler) {
                    typeHandlers.splice(i, 1);
                    break;
                }
            }
        }
    };
    this.fire = function (type, data) {
        var i, len,
            typeHandlers,
            event = {
                type: type,
                data: data
            };

        // if there are handlers for the event, call them in order
        typeHandlers = handlers[type];
        if (typeHandlers) {
            for (i = 0, len = typeHandlers.length; i < len; i++) {
                if (typeHandlers[i]) {
                    typeHandlers[i].call(this, event);
                }
            }
        }
    };
}

function SimpleWebRTCDataChannel(socketIOHost, roomname, username) {
    var socket = io.connect(socketIOHost),
        connections = {};
    var me = this;

    // turn this into an EventTarget
    EventTarget.call(this);

    this.connections = connections;

    this.broadcast = function (message) {
        for (var c in connections) {
            connections[c].send(message);
        }
    };

    this.send = function (to, message) {
        connections[to].send(message);
    };

    this.getPeer = function (id) {
        return connections[id];
    };

    this.getPeers = function () {
        var c, peers = [];
        for (c in connections) {
            peers.push(connections[c]);
        }
        return peers;
    };

    // existing peers
    socket.on('peers', function (peers) {
        peers.forEach(offerConnection);
    });

    // a new peer connects
    socket.on('peer', addConnection);

    socket.on('connect', function () {
        socket.emit('join', roomname, username);
    });

    function addConnection(peer) {
        if (!connections[peer.id]) {
            connections[peer.id] = new Connection(peer);
        }
    }

    function offerConnection(peer) {
        if (!connections[peer.id]) {
            connections[peer.id] = new Connection(peer, true);
        }
    }

    function send(to, message) {
        var json = JSON.stringify({
            to: to,
            message: message
        });
        //log(json);
        socket.send(json);
    }

    function Connection(peer, sendOffer) {
        this.id = peer.id;
        this.name = peer.name;
        var peerId = peer.id;
        var connection = this;
        var peerConnection, dataChannel;
        var sendQueue = [];

        createConnection();
        if (sendOffer) {
            createDataChannel();
            createOffer();
        }
        socket.on('message', function (json) {
            var data = JSON.parse(json);
            if (data.from === peerId) {
                var message = data.message;
                if (message.candidate) {
                    console.log(JSON.stringify(message.candidate))
                    peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                }
                if (message.description) {
                    peerConnection.setRemoteDescription(new RTCSessionDescription(message.description));
                }
                if (message.offer) {
                    createAnswer();
                }
            }
        });

        this.send = function (data) {
            if (dataChannel && dataChannel.readyState === 'open') {
                try {
                    attemptSend(data);
                    return true;
                } catch (err) {
                    console.log(err);
                    return false;
                }
            }
            return false;
        };

        this.close = function () {
            dataChannel.close();
            peerConnection.close();
        };

        function attemptSend(data) {
            if (dataChannel.bufferedAmount) {
                console.log('buffer... ', dataChannel.bufferedAmount);
                sendQueue.push(data);
                setTimeout(attemptSend, 10);
            } else {
                if (!data) {
                    if (sendQueue.length) {
                        data = sendQueue.shift();
                    } else {
                        return;
                    }
                }
                console.log('sending ', data.byteLength || data.length);
                dataChannel.send(data);
            }
        }

        function createOffer() {
            var success = function (desc) {
                peerConnection.setLocalDescription(new RTCSessionDescription(desc));
                send(peerId, {
                    offer: true,
                    description: desc
                });
            };
            var fail = function () {};
            peerConnection.createOffer(success, fail);
        }
        function createAnswer() {
            peerConnection.createAnswer(gotDescription, function () {});
        }

        function createConnection() {
            var peerConnectionConstraint = {
                optional: [{
                    DtlsSrtpKeyAgreement: true
                }],
                mandatory: {
                    OfferToReceiveAudio: false,
                    OfferToReceiveVideo: false
                }
            };
            var dataConstraint = {
                reliable: true
            };
            var config = {
                iceServers: [{
                    url: 'stun:stun.l.google.com:19302'
                }]
            };
            connection.peerConnection = peerConnection = new RTCPeerConnection(config, peerConnectionConstraint);
            peerConnection.addEventListener('icecandidate', gotICECandidate);
            peerConnection.addEventListener('iceconnectionstatechange', handleICEConnectionStateChange);
            peerConnection.addEventListener('datachannel', function (event) {
                if (event.channel) {
                    connection.dataChannel = dataChannel = event.channel;
                    setupDataChannel();
                }
            });
        }

        function handleICEConnectionStateChange(event) {
            switch (peerConnection.iceConnectionState) {
                case 'connected':
                    me.fire('connect', {
                        peer: peer
                    });
                    break;

                case 'closed':
                case 'disconnected':
                    me.fire('disconnect', {
                        peer: peer
                    });
                    delete connections[peerId];
                    break;
            }
        }

        function gotICECandidate(event) {
            var candidate = event.candidate;
            if (candidate) {
                // firefox can't JSON.stringify mozRTCIceCandidate objects apparently...
                if (webrtcDetectedBrowser === 'firefox') {
                    candidate = {
                        sdpMLineIndex: candidate.sdpMLineIndex,
                        sdpMid: candidate.sdpMid,
                        candidate: candidate.candidate
                    };
                }
                send(peerId, {
                    candidate: candidate
                });
            }
        }

        function createDataChannel() {
            connection.dataChannel = dataChannel = peerConnection.createDataChannel('reliable', { reliable: true });
            setupDataChannel();
        }

        function setupDataChannel() {
            dataChannel.addEventListener('open', function () {
                // on open...
                console.log('data channel opened!');
            });
            dataChannel.addEventListener('close', function () {
                // on close...
                console.log('data channel closed!');
            });
            dataChannel.addEventListener('message', function (event) {
                //console.log(event);
                me.fire('message', {
                    peer: peer,
                    message: event.data
                });
            });
        }

        function gotDescription(desc) {
            peerConnection.setLocalDescription(new RTCSessionDescription(desc));
            send(peerId, {
                description: desc
            });
        }
    }
}