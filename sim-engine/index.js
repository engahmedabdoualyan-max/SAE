/**
 * @file sim-engine — public entry point.
 *
 * Re-exports every module and provides the {@link createSimulator} factory.
 *
 * @example
 * import { createSimulator, Network, generateDemand, routeDemand } from './sim-engine/index.js';
 *
 * const net = Network.fromJSON(netData);
 * const demand = routeDemand(generateDemand(odMatrix, net), net);
 *
 * const sim = createSimulator({ dt: 1, seed: 42 })
 *   .loadNetwork(net)
 *   .loadSignals([{ nodeId: 'B', plan: { phases: [{ green: 30 }] } }])
 *   .loadDemand(demand);
 * sim.run(3600, 1);
 */

import { Simulator } from './simulator.js';

export * from './models/idm.js';
export * from './models/mobil.js';
export * from './models/vehicle.js';
export * from './network/graph.js';
export * from './signals/controller.js';
export * from './demand/odMatrix.js';
export * from './kpi/collector.js';
export * from './simulator.js';
export * from './calibration/index.js';
export * from './scenario/manager.js';
export * from './io/networkIO.js';

// Editor UI classes (DOM is touched lazily inside init()/render() only).
export { NetworkEditor, createNetworkEditor, TOOLS, DEFAULT_SIGNAL_PLAN } from './editor/networkEditor.js';
export { SignalEditor, MIN_GREEN_S, MAX_CYCLE_S } from './editor/signalEditor.js';
export { ODEditor, VEHICLE_TYPES, parseCsvRows } from './editor/odEditor.js';

export const VERSION = '1.0.0';

/**
 * Create a ready-to-run Simulator with sane defaults.
 *
 * @param {Object} [config] See {@link Simulator} constructor options:
 *   `{ dt, seed, spawnRate, maxVehicles, kpiEverySteps,
 *      laneChangeEverySteps, leaderHorizon, spawnClearance }`.
 * @returns {Simulator}
 */
export function createSimulator(config = {}) {
  return new Simulator(config);
}
