function EventTarget() {
    var handlers = {};
    this.on = function (type, handler) {
        handlers[type] = handlers[type] || [];
        handlers[type].push(handler);
    };
    this.off = function (type, handler) {
        var typeHandlers = handlers[type],
            i,
            len;

        if (typeHandlers) {
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
        var typeHandlers,
            i,
            len,
            event = {
                type: type,
                data: data
            };

        // if there are handlers for the event, call them in order
        typeHandlers = handlers[event.type];
        if (typeHandlers) {
            for (i = 0, len = typeHandlers.length; i < len; i++) {
                if (typeHandlers[i]) {
                    typeHandlers[i].call(this, event);
                }
            }
        }
    };
}

function SimpleWebRTCDataChannel(socketIOHost, room) {
    var socket = io.connect(socketIOHost),
        connections = {};
    var me = this;

    // turn this into an EventTarget
    EventTarget.call(this);

    this.connections = connections;

    this.send = function (message) {
        for (var c in connections) {
            connections[c].send(message);
        }
    };


    // existing peers
    socket.on('peers', function (peers) {
        peers.forEach(offerConnection);
    });

    // a new peer connects
    socket.on('peer', addConnection);

    socket.on('connect', function () {
        socket.emit('join', room);
    });

    function addConnection(peerId) {
        if (!connections[peerId]) {
            connections[peerId] = new Connection(peerId);
        }
    }

    function offerConnection(peerId) {
        if (!connections[peerId]) {
            connections[peerId] = new Connection(peerId, true);
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

    function Connection(peerId, sendOffer) {
        this.peerId = peerId;
        var connection = this;
        var peerConnection, dataChannel;

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
                console.log(dataChannel.bufferedAmount);
                try {
                    dataChannel.send(data);
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

        function createOffer() {
            var success = function (desc) {
                peerConnection.setLocalDescription(new RTCSessionDescription(desc));
                send(peerId, {
                    offer: true,
                    description: desc
                });
            };
            peerConnection.createOffer(success, function () {});
        }
        function createAnswer() {
            peerConnection.createAnswer(gotDescription);
        }

        function createConnection() {
            if (webrtcDetectedBrowser !== 'chrome' || webrtcDetectedVersion < 31) {
                //alert('webrtc is :( on your browser. try again in a newer browser maybe?');
                //return;
            }
            var peerConnectionConstraint = {
                optional: [{
                    DtlsSrtpKeyAgreement: true
                }]
            };
            var dataConstraint = {
                reliable : true
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
                        peerId: peerId
                    });
                    break;

                case 'closed':
                case 'disconnected':
                    delete connections[peerId];
                    me.fire('disconnect', {
                        peerId: peerId
                    });
                    break;
            }
        }

        function gotICECandidate(event) {
            if (event.candidate) {
                send(peerId, {
                    candidate: event.candidate
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
                    peerId: peerId,
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