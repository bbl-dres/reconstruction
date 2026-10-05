import { buildCollisionData, packCollision } from './collision-data.js?v=v019-galleries';

self.onmessage = ({ data }) => {
  try {
    const result = packCollision(buildCollisionData(data));
    self.postMessage(result, [result.boxes.buffer, result.layout.buffer, result.refs.buffer, result.vertices.buffer]);
  } catch (error) { self.postMessage({ error: error.message || 'Could not prepare walking surfaces.' }); }
};
