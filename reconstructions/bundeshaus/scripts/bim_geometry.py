"""Read the uncompressed glTF 2 geometry used by the offline BIM exporter.

Ordinary nodes and shared meshes are preserved. Compressed/sparse/animated inputs
are rejected explicitly; use the prepared, uncompressed building.glb handoff.
"""
from pathlib import Path
import gzip, json, struct
import numpy as np

def matrix(values):
    return np.asarray(values, dtype=float).reshape(4, 4, order='F')

def packed(value):
    return np.asarray(value).reshape(-1, order='F').tolist()

def points(vertices, transform):
    return np.asarray(vertices) @ transform[:3, :3].T + transform[:3, 3]

class Geometry:
    def __init__(self, path):
        raw = Path(path).read_bytes()
        if raw[:2] == b'\x1f\x8b': raw = gzip.decompress(raw)
        if raw[:4] != b'glTF' or struct.unpack_from('<I', raw, 4)[0] != 2:
            raise ValueError('Expected a glTF 2 GLB')
        length, kind = struct.unpack_from('<II', raw, 12)
        if kind != 0x4e4f534a: raise ValueError('Missing GLB JSON chunk')
        self.document = json.loads(raw[20:20+length])
        offset = 20+length
        size, kind = struct.unpack_from('<II', raw, offset)
        if kind != 0x004e4942: raise ValueError('Missing GLB binary chunk')
        self.binary = raw[offset+8:offset+8+size]
        d = self.document
        if d.get('animations') or d.get('skins'): raise ValueError('Static BIM geometry required')
        if any('EXT_meshopt_compression' in v.get('extensions', {}) for v in d.get('bufferViews', [])):
            raise ValueError('Use the uncompressed authoring GLB, before delivery optimization')
        self.nodes = {}; self.world = {}; self.mesh_cache = {}
        seen = set()
        def visit(i, parent, stack):
            if i in stack or i in seen: raise ValueError('Cyclic or multiply parented glTF node')
            seen.add(i); n = d['nodes'][i]
            if 'matrix' in n: local = matrix(n['matrix'])
            else:
                x,y,z,w = n.get('rotation', [0,0,0,1])
                local = np.eye(4)
                local[:3,:3] = np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                    [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                    [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]) @ np.diag(n.get('scale',[1,1,1]))
                local[:3,3] = n.get('translation',[0,0,0])
            world = parent @ local
            if not np.isfinite(world).all(): raise ValueError('Nonfinite node transform')
            if 'mesh' in n:
                ident = n.get('extras',{}).get('viewer_id')
                if not ident or ident in self.nodes: raise ValueError('Missing/duplicate component ID')
                self.nodes[ident] = n; self.world[ident] = world
            for child in n.get('children',[]): visit(child,world,stack|{i})
        for i in d['scenes'][d.get('scene',0)]['nodes']: visit(i,np.eye(4),set())

    def accessor(self, index):
        a = self.document['accessors'][index]
        if 'sparse' in a: raise ValueError('Sparse accessor not supported by this reference exporter')
        v = self.document['bufferViews'][a['bufferView']]
        if v.get('buffer',0) != 0: raise ValueError('External buffer unsupported')
        width = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        dtype = np.dtype({5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']])
        offset = v.get('byteOffset',0)+a.get('byteOffset',0)
        stride = v.get('byteStride',width*dtype.itemsize)
        return np.ndarray((a['count'],width),dtype,buffer=self.binary,offset=offset,strides=(stride,dtype.itemsize)).copy()

    def mesh(self, index):
        if index not in self.mesh_cache:
            result = []
            for p in self.document['meshes'][index]['primitives']:
                if p.get('mode',4) != 4 or p.get('targets') or p.get('extensions'):
                    raise ValueError('Expected ordinary triangle primitives')
                verts = self.accessor(p['attributes']['POSITION'])
                faces = self.accessor(p['indices']).reshape(-1,3) if 'indices' in p else np.arange(len(verts)).reshape(-1,3)
                result.append((verts,faces,p.get('material')))
            self.mesh_cache[index] = result
        return self.mesh_cache[index]

    def bounds(self, ids, root=None):
        lo = np.full(3,np.inf); hi = -lo
        inverse = np.linalg.inv(root) if root is not None else np.eye(4)
        for ident in ids:
            for vertices,_,_ in self.mesh(self.nodes[ident]['mesh']):
                vv = points(vertices,inverse@self.world[ident])
                lo=np.minimum(lo,vv.min(axis=0)); hi=np.maximum(hi,vv.max(axis=0))
        return [lo.tolist(),hi.tolist()]
