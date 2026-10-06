import { buildCollisionData } from './collision-data.js?v=terrain-2';

self.onmessage = ({ data }) => {
  try {
    const result = buildCollisionData(data);
    self.postMessage(result, [result.boxes.buffer, result.layout.buffer, result.refs.buffer, result.vertices.buffer]);
  } catch (error) { self.postMessage({ error: error.message || 'Could not prepare walking surfaces.' }); }
};
