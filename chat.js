import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

// const firebaseConfig = {
//   apiKey: "AIzaSyC2o0TdRJwsrrzchpo1lMh6A6emHEmQ2n0",
//   authDomain: "omegle-backend.firebaseapp.com",
//   projectId: "omegle-backend",
//   storageBucket: "omegle-backend.appspot.com",
//   messagingSenderId: "1031690665243",
//   appId: "1:1031690665243:web:9eb0fd20f956efa6b467be",
//   measurementId: "G-DHWJTBH13N"
// };

const firebaseConfig = {
  apiKey: "AIzaSyCjHzEzc8HT-6yh5BIOeaxtbyvKzZYiWK8",
  authDomain: "omegle-se.firebaseapp.com",
  projectId: "omegle-se",
  storageBucket: "omegle-se.appspot.com",
  messagingSenderId: "986541943152",
  appId: "1:986541943152:web:dead6678823e27d1af87b5",
  measurementId: "G-9W8EX2RL3Y"
};



if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
let pc = new RTCPeerConnection(servers);
console.log(pc)
let localStream = null;
let remoteStream = null;

//related to database
const peers_available = firestore.collection('available');    //collection of available peers
var number_of_peers = peers_available.size

// HTML elements
const webcamVideo = document.getElementById('webcamVideo');
const callInput = document.getElementById('callInput');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const randomButton = document.getElementById('randomButton');
const online = document.getElementById('online')

// 0. We add functionality of button which allows for randomized connection
// first check if connection is available
// if not, then create one and add to database
randomButton.onclick = async () => {

  remoteVideo.style.backgroundImage = 'url("./gorilla-gangnam.gif")';
  remoteVideo.style.backgroundSize = 'contain';
  
  // Remove any other background properties, if previously set
  remoteVideo.style.backgroundRepeat = 'no-repeat';
  remoteVideo.style.backgroundPosition = 'center';

  console.log("random")

  const available = await peers_available.get();

  console.log(available)
  
  if(available.size === 0){
    console.log("empty")

    //create a new connection
    callnow();
  }

  else{
    //get the first element from the collection
    const peer = available.docs[0].data();
    console.log(peer)
    console.log(peer.id)
    callInput.value = peer.id;
    answercall();

    //delete the peer from the collection
    peers_available.doc(peer.id).delete();
  }

  randomButton.disabled = true;
}

// 1. Setup media sources

let webcamenable = async () => {
  console.log("webcam") 
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  // callButton.disabled = false;
  // answerButton.disabled = false;
  // webcamButton.disabled = true;
  randomButton.disabled = false;
};

// 2. Create an offer
let callnow = async () => {
  // Reference Firestore collections for signaling
  console.log("here")
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  console.log(offerDescription)
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  console.log("here2")
  await callDoc.set({ offer });
  console.log("here3")
  await callDoc.update({endCall: false});
  await peers_available.doc(callDoc.id).set({id: callDoc.id});

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }

    if(data.endCall){
      console.log("endCall")
      hangupButton.onclick();
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
let answercall = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if(data.endCall){
      console.log("endCall")
      hangupButton.onclick();
    }
  });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

  hangupButton.disabled = false;
};

//when we hangup, the meeting is over
hangupButton.onclick = () => {

  
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const hangup = callDoc.endCall
  
  //If it was never connected, then we gotta delete it from the available collection
  if(peers_available.doc(callId)){
    peers_available.doc(callId).delete();
  }

  if(!hangup){
    callDoc.update({endCall: true});
  }
  
  console.log("hangup")
  
  const remoteTracks = remoteStream.getTracks();
  remoteTracks.forEach((track) => track.stop());
  
  remoteVideo.srcObject = null;

  remoteVideo.style.backgroundImage='url("./g1.jpeg")';
  remoteVideo.style.backgroundSize = 'contain';
  remoteVideo.style.backgroundRepeat = 'no-repeat';
  remoteVideo.style.backgroundPosition = 'center';
  
  pc.close();
  
  //reset pc
  pc = new RTCPeerConnection(servers);
  console.log(pc)
  webcamenable();

  randomButton.disabled = false;
  
  // firestore.collection('calls').doc(callId).delete();
}

let update_online=()=>{
  peers_available.onSnapshot((querySnapshot)=>{
    console.log(querySnapshot.size)
    online.innerText = `Available : ${querySnapshot.size}`;
  })
}

//In case the window is being closed
window.addEventListener('beforeunload', (e)=>{
  //gotta handle this
}); 

webcamenable();

update_online();