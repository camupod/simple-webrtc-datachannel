function SimpleWebRTCDataChannel(socketIOHost, roomname, username) {
    var socket = io.connect(socketIOHost),
        connections = {};
    var me = this;

    // turn this into an EventTarget
    EventTarget.call(this);

    this.connections = connections;

    this.broadcast = function (message) {
        for (var c in connections) {
            connections[c].dataConnection.send(message);
        }
    };

    this.send = function (to, message) {
        connections[to].dataConnection.send(message);
    };

    this.getPeer = function (id) {
        return connections[id].peer;
    };

    this.getPeers = function () {
        var c, peers = [];
        for (c in connections) {
            peers.push(connections[c].peer);
        }
        return peers;
    };

    // existing peers
    socket.on('peers', function (peers) {
        peers.forEach(addPeerOffer);
    });

    // a new peer connects
    socket.on('peer', addPeer);

    socket.on('connect', function () {
        socket.emit('join', roomname, username);
    });

    socket.on('message', function (json) {
        var data = JSON.parse(json),
            connection = connections[data.from].dataConnection;
        console.log(data)
        if (connection) {
            var message = data.message;
            console.log(message)
            if (message.candidate) {
                connection.addCandidate(message.candidate);
            }
            if (message.description) {
                connection.setDescription(message.description);
            }
            if (message.offer) {
                connection.createAnswer();
            }
        }
    });

    function addPeer(peer) {
        var connection;
        if (!connections[peer.id]) {
            console.log(peer)
            connection =  {
                dataConnection: new DataConnection(),
                peer: peer
            };
            bindConnectionEvents(connection);
            connections[peer.id] = connection;
        }
        return connections[peer.id];
    }

    function addPeerOffer(peer) {
        var connection = addPeer(peer);
        connection.dataConnection.createOffer();
    }

    function bindConnectionEvents(connection) {
        var dataConnection = connection.dataConnection;
        dataConnection.on('offer', function (event) {
            send(connection.peer.id, { offer: true, description: event.data });
        });
        dataConnection.on('candidate', function (event) {
            send(connection.peer.id, { candidate: event.data });
        });
        dataConnection.on('answer', function (event) {
            send(connection.peer.id, { answer:true, description: event.data });
        });
        dataConnection.on('connect', function (event) {
            me.fire('connect', {
                peer: connection.peer
            });
        });
        dataConnection.on('disconnect', function (event) {
            me.fire('disconnect', {
                peer: connection.peer
            });
            // remove this connection
            delete connections[connection.peer.id];
        });
        dataConnection.on('datachannelopen', function (event) {

        });
        dataConnection.on('datachannelclose', function (event) {

        });
        dataConnection.on('message', function (event) {
            me.fire('message', {
                peer: connection.peer,
                message: event.data
            });
        });
    }

    function send(to, message) {
        var json = JSON.stringify({
            to: to,
            message: message
        });
        //log(json);
        socket.send(json);
    }

}
