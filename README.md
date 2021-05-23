# video-chat

### Group video chat application built on NodeJS, WebRTC, and Socket.IO

---

# Backend

## server.js

This starts the web-server and listens to routes in routes.js,
And it also starts the signaling-server.

## routes.js

This handles all of the http requests.

## signaling-server.js

This starts the signaling server for WebRTC.
Here is an article explaining signaling servers, [link](https://www.wowza.com/blog/webrtc-signaling-servers)

---

# Frontend

## public

This contains the files sent to the client.
The script.js file contains all of the socket.io functionalities.

---

# Running

First install yarn if you haven't already.

-   Windows
    -   `npm install --global yarn`
-   Mac
    -   `brew install yarn`

You'll need to install `node.js`:

-   Windows
    -   Download the Node LTS installer from this [link](https://nodejs.org/en/download/) (includes npm)
-   Mac
    -   run this command in your terminal: `brew install node`

Then run `yarn` inside the root project directory to install:

Then simply run the server with:

```
yarn start
```

Then to connect to the server through your browser:

-   [http://localhost:3000](http://localhost:3000)

---

---

## Side note:

Using http, WebRTC only works on the computer that's running it.
To use it across different devices, it requires https.

I used openssl to generate local cert files, but if the project is served on a secure server it should work regardless.
