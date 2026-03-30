const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const env = require('./config/env');

const app = express();

app.set('env', env);
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

// Healthcheck
app.get('/health', (req, res) => res.json({ status: 'OK' }));

module.exports = app;
