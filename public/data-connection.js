function DataConnection() {
    var constraints = {
        optional: [{
            DtlsSrtpKeyAgreement: true
        }],
        mandatory: {
            OfferToReceiveAudio: false,
            OfferToReceiveVideo: false
        }
    };
    var connection = this;
    var peerConnection, dataChannel;
    var sendQueue = [];

    var RTCPeerConnection     = window.RTCPeerConnection ||
                                window.mozRTCPeerConnection ||
                                window.webkitRTCPeerConnection;
    var RTCIceCandidate       = window.RTCIceCandidate ||
                                window.mozRTCIceCandidate;
    var RTCSessionDescription = window.RTCSessionDescription ||
                                window.mozRTCSessionDescription;

    // turn this into an EventTarget
    EventTarget.call(this);

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
        dataChannel && dataChannel.close();
        peerConnection.close();
    };

    this.setDescription = function (description) {
        // console.log('setting description', description);
        peerConnection.setRemoteDescription(new RTCSessionDescription(description));
    };

    this.addCandidate = function (candidate) {
        // console.log(candidate);
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    };

    this.createAnswer = function () {
        peerConnection.createAnswer(
            function createAnswerSuccess(description) {
                description.sdp = applySdpHack(description.sdp);
                peerConnection.setLocalDescription(new RTCSessionDescription(description));
                connection.fire('answer', description);
            },
            function createAnswerFail() {
                console.error('could not create answer');
            },
            constraints
        );
    };

    this.createOffer = function () {
        // create a data channel for use with this offer
        createDataChannel();

        peerConnection.createOffer(
            function createOfferSuccess(description) {
                description.sdp = applySdpHack(description.sdp);
                peerConnection.setLocalDescription(new RTCSessionDescription(description));
                connection.fire('offer', description);
            },
            function createOfferFail() {
                console.error('failed to create offer');
            },
            constraints
        );
    };

    function attemptSend(data) {
        if (dataChannel.bufferedAmount) {
            // console.log('buffer... ', dataChannel.bufferedAmount);
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
            // console.log('sending ', data.byteLength || data.length);
            dataChannel.send(data);
        }
    }

    function createConnection() {
        var config = {
            iceServers: [
                { url: 'stun:stun.l.google.com:19302' }
            ]
        };
        connection.peerConnection = peerConnection = new RTCPeerConnection(config, constraints);
        peerConnection.addEventListener('icecandidate', handleICECandidate);
        peerConnection.addEventListener('iceconnectionstatechange', handleICEConnectionStateChange);
        peerConnection.addEventListener('datachannel', handleDataChannel);
    }

    function handleICEConnectionStateChange(event) {
        switch (peerConnection.iceConnectionState) {
            case 'connected':
                connection.fire('connect');
                break;

            case 'closed':
            case 'disconnected':
                connection.fire('disconnect');
                break;
        }
    }

    function handleDataChannel(event) {
        if (event.channel) {
            connection.dataChannel = dataChannel = event.channel;
            setupDataChannel();
        }
    }

    function handleICECandidate(event) {
        var candidate = event.candidate;
        if (candidate) {
            // firefox can't JSON.stringify mozRTCIceCandidate objects apparently...
            if (window.mozRTCPeerConnection) {
                candidate = {
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    sdpMid: candidate.sdpMid,
                    candidate: candidate.candidate
                };
            }
            connection.fire('candidate', candidate);
        } else {
            connection.fire('candidateend');
        }
    }

    function createDataChannel() {
        connection.dataChannel = dataChannel = peerConnection.createDataChannel('reliable', { reliable: true });
        setupDataChannel();
    }

    function setupDataChannel() {
        dataChannel.addEventListener('open', function () {
            // on open...
            connection.fire('datachannelopen', dataChannel);
        });
        dataChannel.addEventListener('close', function () {
            // on close...
            connection.fire('datachannelclose', dataChannel);
        });
        dataChannel.addEventListener('message', function (event) {
            //console.log(event);
            connection.fire('message', event.data);
        });
    }

    // borrowed from https://github.com/HenrikJoreteg/RTCPeerConnection
    function applySdpHack(sdp) {
        var parts = sdp.split('b=AS:30');
        if (parts.length === 2) {
            // increase max data transfer bandwidth to 100 Mbps
            return parts[0] + 'b=AS:102400' + parts[1];
        } else {
            return sdp;
        }
    }

    createConnection();
}
