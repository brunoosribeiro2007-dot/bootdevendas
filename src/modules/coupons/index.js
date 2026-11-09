'use strict';

const matchingEngine = require('./matchingEngine');
const couponStore = require('./couponStore');
const messageFormatter = require('./messageFormatter');
const couponService = require('./couponService');

module.exports = {
  ...matchingEngine,
  ...couponStore,
  ...messageFormatter,
  ...couponService
};
