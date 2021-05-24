/** CONFIG **/
// const SIGNALING_SERVER = "https://localhost";
let USE_AUDIO = true
let USE_VIDEO = true
const DEFAULT_CHANNEL = 'some-global-channel-name'
const MUTE_AUDIO_BY_DEFAULT = false

/** You should probably use a different stun server doing commercial stuff **/
/** Also see: https://gist.github.com/zziuni/3741933 **/
const ICE_SERVERS = [{ url: 'stun:stun.l.google.com:19302' }]

let signaling_socket = null /* our socket.io connection to our webserver */
let local_media_stream = null /* our own microphone / webcam */
let peers =
    {} /* keep track of our peer connections, indexed by peer_id (aka socket.io id) */
let peer_media_elements =
    {} /* keep track of our <video>/<audio> tags, indexed by peer_id */

function init() {
    console.log('Connecting to signaling server')
    // signaling_socket = io(SIGNALING_SERVER);
    signaling_socket = io()

    signaling_socket.on('connect', () => {
        console.log('Connected to signaling server')
        setup_local_media(() => {
            /* once the user has given us access to their
             * microphone/camcorder, join the channel and start peering up */
            join_chat_channel(DEFAULT_CHANNEL, {
                'whatever-you-want-here': 'stuff',
            })
        })
    })
    signaling_socket.on('disconnect', () => {
        console.log('Disconnected from signaling server')
        /* Tear down all of our peer connections and remove all the
         * media divs when we disconnect */
        for (peer_id in peer_media_elements) {
            peer_media_elements[peer_id].remove()
        }
        for (peer_id in peers) {
            peers[peer_id].close()
        }

        peers = {}
        peer_media_elements = {}
    })
    function join_chat_channel(channel, userdata) {
        signaling_socket.emit('join', { channel: channel, userdata: userdata })
    }
    function part_chat_channel(channel) {
        signaling_socket.emit('part', channel)
    }

    /**
     * When we join a group, our signaling server will send out 'addPeer' events to each pair
     * of users in the group (creating a fully-connected graph of users, ie if there are 6 people
     * in the channel you will connect directly to the other 5, so there will be a total of 15
     * connections in the network).
     */
    signaling_socket.on('addPeer', config => {
        console.log('Signaling server said to add peer:', config)
        let peer_id = config.peer_id
        if (peer_id in peers) {
            /* This could happen if the user joins multiple channels where the other peer is also in. */
            console.log('Already connected to peer ', peer_id)
            return
        }
        let peer_connection = new RTCPeerConnection(
            { iceServers: ICE_SERVERS },
            { optional: [{ DtlsSrtpKeyAgreement: true }] }
            /* this will no longer be needed by chrome
             * eventually (supposedly), but is necessary
             * for now to get firefox to talk to chrome */
        )
        peers[peer_id] = peer_connection

        peer_connection.onicecandidate = event => {
            if (event.candidate) {
                signaling_socket.emit('relayICECandidate', {
                    peer_id: peer_id,
                    ice_candidate: {
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        candidate: event.candidate.candidate,
                    },
                })
            }
        }
        peer_connection.onaddstream = event => {
            console.log('onAddStream', event)
            let remote_media = USE_VIDEO
                ? document.createElement('video')
                : document.createElement('audio')
            remote_media.setAttribute('autoplay', 'autoplay')
            if (MUTE_AUDIO_BY_DEFAULT) {
                remote_media.setAttribute('muted', 'true')
            }
            remote_media.setAttribute('controls', '')
            peer_media_elements[peer_id] = remote_media
            document.querySelector('body').append(remote_media)
            attachMediaStream(remote_media, event.stream)
        }

        /* Add our local stream */
        peer_connection.addStream(local_media_stream)

        /* Only one side of the peer connection should create the
         * offer, the signaling server picks one to be the offerer.
         * The other user will get a 'sessionDescription' event and will
         * create an offer, then send back an answer 'sessionDescription' to us
         */
        if (config.should_create_offer) {
            console.log('Creating RTC offer to ', peer_id)
            peer_connection.createOffer(
                local_description => {
                    console.log(
                        'Local offer description is: ',
                        local_description
                    )
                    peer_connection.setLocalDescription(
                        local_description,
                        () => {
                            signaling_socket.emit('relaySessionDescription', {
                                peer_id: peer_id,
                                session_description: local_description,
                            })
                            console.log('Offer setLocalDescription succeeded')
                        },
                        () => {
                            Alert('Offer setLocalDescription failed!')
                        }
                    )
                },
                error => {
                    console.log('Error sending offer: ', error)
                }
            )
        }
    })

    /**
     * Peers exchange session descriptions which contains information
     * about their audio / video settings and that sort of stuff. First
     * the 'offerer' sends a description to the 'answerer' (with type
     * "offer"), then the answerer sends one back (with type "answer").
     */
    signaling_socket.on('sessionDescription', config => {
        console.log('Remote description received: ', config)
        let peer_id = config.peer_id
        let peer = peers[peer_id]
        let remote_description = config.session_description
        console.log(config.session_description)

        let desc = new RTCSessionDescription(remote_description)
        let stuff = peer.setRemoteDescription(
            desc,
            () => {
                console.log('setRemoteDescription succeeded')
                if (remote_description.type == 'offer') {
                    console.log('Creating answer')
                    peer.createAnswer(
                        local_description => {
                            console.log(
                                'Answer description is: ',
                                local_description
                            )
                            peer.setLocalDescription(
                                local_description,
                                () => {
                                    signaling_socket.emit(
                                        'relaySessionDescription',
                                        {
                                            peer_id: peer_id,
                                            session_description:
                                                local_description,
                                        }
                                    )
                                    console.log(
                                        'Answer setLocalDescription succeeded'
                                    )
                                },
                                () => {
                                    Alert('Answer setLocalDescription failed!')
                                }
                            )
                        },
                        error => {
                            console.log('Error creating answer: ', error)
                            console.log(peer)
                        }
                    )
                }
            },
            error => {
                console.log('setRemoteDescription error: ', error)
            }
        )
        console.log('Description Object: ', desc)
    })

    /**
     * The offerer will send a number of ICE Candidate blobs to the answerer so they
     * can begin trying to find the best path to one another on the net.
     */
    signaling_socket.on('iceCandidate', config => {
        let peer = peers[config.peer_id]
        let ice_candidate = config.ice_candidate
        peer.addIceCandidate(new RTCIceCandidate(ice_candidate))
    })

    /**
     * When a user leaves a channel (or is disconnected from the
     * signaling server) everyone will recieve a 'removePeer' message
     * telling them to trash the media channels they have open for those
     * that peer. If it was this client that left a channel, they'll also
     * receive the removePeers. If this client was disconnected, they
     * wont receive removePeers, but rather the
     * signaling_socket.on('disconnect') code will kick in and tear down
     * all the peer sessions.
     */
    signaling_socket.on('removePeer', config => {
        console.log('Signaling server said to remove peer:', config)
        let peer_id = config.peer_id
        if (peer_id in peer_media_elements) {
            peer_media_elements[peer_id].remove()
        }
        if (peer_id in peers) {
            peers[peer_id].close()
        }

        delete peers[peer_id]
        delete peer_media_elements[config.peer_id]
    })
}

/***********************/
/** Local media stuff **/
/***********************/
function setup_local_media(callback, errorback) {
    if (local_media_stream != null) {
        /* ie, if we've already been initialized */
        if (callback) callback()
        return
    }
    /* Ask user for permission to use the computers microphone and/or camera,
     * attach it to an <audio> or <video> tag if they give us access. */
    console.log('Requesting access to local audio / video inputs')

    navigator.getUserMedia =
        navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia

    attachMediaStream = (element, stream) => {
        if (typeof element.srcObject == 'object') {
            element.srcObject = stream
        } else {
            element.src = URL.createObjectURL(stream)
        }
    }

    navigator.getUserMedia(
        { audio: USE_AUDIO, video: USE_VIDEO },
        stream => {
            /* user accepted access to a/v */
            console.log('Access granted to audio/video')
            local_media_stream = stream
            let local_media = USE_VIDEO
                ? document.createElement('video')
                : document.createElement('audio')
            local_media.setAttribute('autoplay', 'autoplay')
            local_media.muted = true /* always mute ourselves by default */
            local_media.setAttribute('controls', '')
            document.querySelector('body').append(local_media)
            attachMediaStream(local_media, stream)

            if (callback) callback()
        },
        () => {
            /* user denied access to a/v */
            console.log('Access denied for audio/video')
            alert(
                'You chose not to provide access to the camera/microphone, demo will not work.'
            )
            if (errorback) errorback()
        }
    )
}
