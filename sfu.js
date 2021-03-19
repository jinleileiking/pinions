
var log = msg => {
    console.log(msg)
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const wsuri = "wss://" + location.host + "/ws";
const socket = new WebSocket(wsuri);



const config = {
  // iceServers: [{
  //   urls: 'stun:stun.l.google.com:19302'
  // }]
}

let localStream

const pcPublish = new RTCPeerConnection(config)

// 0. getmedia and setLocalDescription
navigator.mediaDevices.getUserMedia({ video: true, audio: true})
    .then(stream => {
        let el = document.createElement("Video")
        el.srcObject = stream
        el.autoplay = true
        el.controls = false
        el.muted = true
        document.getElementById('local').appendChild(el)
        localStream = stream

        // pcPublish.addStream(stream)
        // pcPublish.addTransceiver(stream.getVideoTracks()[0], {
        //     direction: "sendonly",
        //     streams: [stream],
        //     sendEncodings: [
        //         // for firefox order matters... first high resolution, then scaled resolutions...
        //         {
        //             rid: "f",
        //         }
        //     ],
        // });
        // pcPublish.addTransceiver("video");

        // pcPublish.addTransceiver(stream.getVideoTracks()[0], {
        //     direction: "sendonly",
        //     streams: [stream],
        //     sendEncodings: [
        //         // for firefox order matters... first high resolution, then scaled resolutions...
        //         {
        //             rid: "f",
        //         },
        //         {
        //             rid: "h",
        //             scaleResolutionDownBy: 2.0,
        //         },
        //         {
        //             rid: "q",
        //             scaleResolutionDownBy: 4.0,
        //         },
        //     ],
        // });
        // pcPublish.addTransceiver("video");
        // pcPublish.addTransceiver("video");
        // pcPublish.addTransceiver("video");


    }).catch(log)




pcPublish.oniceconnectionstatechange = e => log(`[rtc]ICE connection state: ${pcPublish.iceConnectionState}`)

pcPublish.ontrack = function ({ track, streams }) {
    if (track.kind === "video") {
        log("[rtc]ontrack video")
        // track.onunmute = () => {
        //   log("[rtc]onunmute")
        let el = document.createElement(track.kind)
        el.srcObject = streams[0]
        el.autoplay = true

        document.getElementById('remote').appendChild(el)
        // }
    }
}

pcPublish.onicecandidate = event => {
    log("[rtc]onicecandidate, sending trickle on ws")
    log(event.candidate)
    if (event.candidate !== null) {
        socket.send(JSON.stringify({
            method: "trickle",
            params: {
                candidate: event.candidate,
            }
        }))
    }
}



const id = uuidv4()



socket.addEventListener('message', async (event) => {
    const resp = JSON.parse(event.data)

    // Listen for server renegotiation notifications
    if (!resp.id && resp.method === "offer") {
        log(`[ws]receive offer`)
        log(resp.params)
        await pcPublish.setRemoteDescription(resp.params)
        const answer = await pcPublish.createAnswer()
        await pcPublish.setLocalDescription(answer)

        log(`[ws]Sending answer`)
        log(answer)
        socket.send(JSON.stringify({
            method: "answer",
            params: { desc: answer },
            id
        }))
    }
})





const join = async () => {
    const offer = await pcPublish.createOffer()
    await pcPublish.setLocalDescription(offer)

    log("[ws]Sending join")
    log(pcPublish.localDescription)
    socket.send(JSON.stringify({
        method: "join",
        params: { sid: "test room", offer: pcPublish.localDescription },
        id
    }))


    socket.addEventListener('message', (event) => {
        const resp = JSON.parse(event.data)
        if (resp.id === id) {
            log(`[ws]receive answer`)
            log(resp.result)

            // Hook this here so it's not called before joining
            pcPublish.onnegotiationneeded = async function () {
                log("[rtc]onnegotiationneeded")
                const offer = await pcPublish.createOffer()
                await pcPublish.setLocalDescription(offer)
                socket.send(JSON.stringify({
                    method: "offer",
                    params: { desc: offer },
                    id
                }))

                socket.addEventListener('message', (event) => {
                    const resp = JSON.parse(event.data)
                    if (resp.id === id) {
                        log(`[ws]Got renegotiation answer`)
                        pcPublish.setRemoteDescription(resp.result)
                    }
                })
            }

            log(`[rtc]setRemoteDescription`)
            // log(resp)
            pcPublish.setRemoteDescription(resp.result)
        } else if (resp.method == "trickle"){
            log("[ws]receive trickle")
            log(resp.params)
            pcPublish.addIceCandidate(resp.params)
        }
    })
}


// click pub button
window.Pub = () => {
    log("Publishing stream")

    localStream.getTracks().forEach((track) => {
        log("add track")
        pcPublish.addTrack(track, localStream);
    });


    join()
}


