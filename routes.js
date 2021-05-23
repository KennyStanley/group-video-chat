// Setup
const express = require('express')
const bodyParser = require('body-parser')

const routes = express()

routes.use(express.static('public'))

// Enable for POST requests
//routes.use(express.bodyParser());

routes.get('/test', (req, res) => {
    res.send('😊')
})

module.exports = routes
