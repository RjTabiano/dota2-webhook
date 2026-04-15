'use strict';

require('dotenv').config();

const { main } = require('./src/processor');

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
