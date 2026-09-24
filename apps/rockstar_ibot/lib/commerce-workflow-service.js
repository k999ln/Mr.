"use strict";

const {
  requireCommerceConnector,
} = require("./commerce-connector-catalog.js");
const {
  createCommerceWorkflowPlan,
} = require("./commerce-workflow-plan.js");

const TARGET_KIND = Object.freeze({
  launch_offer: "product",
  recover_revenue: "order",
  deliver_order: "order",
  nurture_customer: "customer",
});
const DEFAULT_LEAD_MINUTES = Object.freeze({
  launch_offer: 24 * 60,
  recover_revenue: 24 * 60,
  deliver_order: 60,
  nurture_customer: 48 * 60,
});

function parseWorkflowArgs(value) {
  const parts = String(value || "").split("|").map((item) => item.trim());
  if (parts.length === 1) {
    const tokens = parts[0].split(/\s+/).filter(Boolean);
    return { templateKey: tokens[0] || "", targetId: tokens[1] || "", deadline: tokens[2] || "" };
  }
  return { templateKey: parts[0] || "", targetId: parts[1] || "", deadline: parts[2] || "" };
}

function defaultDeadline(templateKey, nowMs = Date.now()) {
  const minutes = DEFAULT_LEAD_MINUTES[templateKey];
  if (!minutes) throw new Error("commerce workflow template invalid");
  return new Date(nowMs + minutes * 60_000).toISOString();
}

function setupRefKey(connector) {
  const prefix = connector.key.replace(/-/g, "_");
  if (connector.setup_mode === "artifact_reference") return `${prefix}_artifact_ref`;
  if (connector.setup_mode === "managed_reference") return `${prefix}_deployment_ref`;
  return `${prefix}_connection_ref`;
}

function adapterRefKey(connector) {
  return `${connector.key.replace(/-/g, "_")}_runtime_adapter_ref`;
}

function targetRefs(templateKey, target) {
  const id = String(target.id);
  const data = target.data || {};
  const refs = {
    goal_ref: `commerce-goal://${templateKey}/${id}`,
  };
  if (templateKey === "launch_offer") refs.offer_ref = `commerce-object://product/${id}`;
  if (templateKey === "deliver_order" || templateKey === "recover_revenue") {
    refs.order_ref = `commerce-object://order/${id}`;
  }
  if (templateKey === "deliver_order") {
    refs.delivery_ref = `commerce-delivery://order/${id}`;
  }
  if (templateKey === "recover_revenue" && data.customer_id) {
    refs.customer_ref = `commerce-object://customer/${data.customer_id}`;
  }
  if (templateKey === "nurture_customer") {
    refs.customer_ref = `commerce-object://customer/${id}`;
    if (data.content_ref) refs.content_ref = data.content_ref;
  }
  return refs;
}

function connectorRefs(entitlement) {
  const refs = {};
  const selections = entitlement.selections || [];
  for (const selection of selections) {
    // A button selection consumes an entitlement slot but grants no provider authority. Plans may
    // use only connections that an adapter-specific flow has verified and marked connected.
    if (!selection.active || selection.connectionState !== "connected") continue;
    const connector = requireCommerceConnector(selection.connectorKey);
    if (selection.credentialReference) {
      refs[setupRefKey(connector)] = selection.credentialReference;
    }
    if (!connector.availability.runtime_ready && selection.runtimeAdapterReference) {
      refs[adapterRefKey(connector)] = selection.runtimeAdapterReference;
    }
  }
  return refs;
}

function buildCommerceWorkflowProposal(input) {
  const templateKey = String(input.templateKey || "").trim().replace(/-/g, "_");
  const expectedKind = TARGET_KIND[templateKey];
  if (!expectedKind) throw new Error("commerce workflow template invalid");
  if (!input.target || input.target.kind !== expectedKind) {
    const error = new Error("commerce workflow target invalid");
    error.code = "target_invalid";
    throw error;
  }
  const entitlement = input.entitlement || {};
  return createCommerceWorkflowPlan({
    templateKey,
    deadline: input.deadline || defaultDeadline(templateKey, input.nowMs),
    selectedToolKeys: entitlement.activeToolKeys || [],
    paid: entitlement.paid === true,
    inputRefs: {
      ...targetRefs(templateKey, input.target),
      ...connectorRefs(entitlement),
    },
  });
}

module.exports = {
  TARGET_KIND,
  DEFAULT_LEAD_MINUTES,
  parseWorkflowArgs,
  defaultDeadline,
  buildCommerceWorkflowProposal,
};
