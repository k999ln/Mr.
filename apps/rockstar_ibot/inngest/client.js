// inngest/client.js — shared Inngest client for the rockstar_ibot app.
// Uses the verified 2-arg createFunction API (triggers inside the first config object).
"use strict";

const { Inngest } = require("inngest");

const inngest = new Inngest({ id: "rockstar_ibot" });

module.exports = { inngest };
