globalThis.fetch = async () => {
  throw new Error('simulated OSV outage');
};
