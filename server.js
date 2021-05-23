// Config
const PORT = process.env.PORT || 3000
const useHTTPS = true

// Setup
const app = require('./routes')

let server = null
if (useHTTPS) {
    const fs = require('fs')
    const https = require('https')
    const options = {
        key: fs.readFileSync('certs/key.pem', 'utf-8'),
        cert: fs.readFileSync('certs/cert.pem', 'utf-8'),
    }
    server = https.createServer(options, app)
} else {
    const http = require('http')
    server = http.createServer(app)
}

server.listen(PORT, null, () => {
    console.log(
        `${useHTTPS ? 'HTTPS' : 'HTTP'} Server listening on port ${PORT}`
    )
})

const signaling_server = require('./signaling-server')(server)
