import { e, f, model, object, tuple } from '../../../../src/schema';

export const SzInt8Obj = object('SzInt8Obj', {
  val: f.int8(),
  opt: f.int8().optional(),
});

export const SzInt8Tup = tuple('SzInt8Tup', [e.int8(), e.int8().nullable()]);

export const SzInt8 = model('SzInt8', {
  id: f.record().id(),
  reqVal: f.int8(),
  optVal: f.int8().optional(),
  nullVal: f.int8().nullable(),
  arrVal: f.int8().array(),
  setVal: f.int8().array().set(),
  dfltVal: f.int8().default(-5),
  objVal: f.object(SzInt8Obj),
  tupVal: f.tuple(SzInt8Tup),
});

export const SzUint8Obj = object('SzUint8Obj', {
  val: f.uint8(),
  opt: f.uint8().optional(),
});

export const SzUint8Tup = tuple('SzUint8Tup', [e.uint8(), e.uint8().nullable()]);

export const SzUint8 = model('SzUint8', {
  id: f.record().id(),
  reqVal: f.uint8(),
  optVal: f.uint8().optional(),
  nullVal: f.uint8().nullable(),
  arrVal: f.uint8().array(),
  setVal: f.uint8().array().set(),
  dfltVal: f.uint8().default(7),
  objVal: f.object(SzUint8Obj),
  tupVal: f.tuple(SzUint8Tup),
});

export const SzInt16Obj = object('SzInt16Obj', {
  val: f.int16(),
  opt: f.int16().optional(),
});

export const SzInt16Tup = tuple('SzInt16Tup', [e.int16(), e.int16().nullable()]);

export const SzInt16 = model('SzInt16', {
  id: f.record().id(),
  reqVal: f.int16(),
  optVal: f.int16().optional(),
  nullVal: f.int16().nullable(),
  arrVal: f.int16().array(),
  setVal: f.int16().array().set(),
  dfltVal: f.int16().default(-40),
  objVal: f.object(SzInt16Obj),
  tupVal: f.tuple(SzInt16Tup),
});

export const SzUint16Obj = object('SzUint16Obj', {
  val: f.uint16(),
  opt: f.uint16().optional(),
});

export const SzUint16Tup = tuple('SzUint16Tup', [e.uint16(), e.uint16().nullable()]);

export const SzUint16 = model('SzUint16', {
  id: f.record().id(),
  reqVal: f.uint16(),
  optVal: f.uint16().optional(),
  nullVal: f.uint16().nullable(),
  arrVal: f.uint16().array(),
  setVal: f.uint16().array().set(),
  dfltVal: f.uint16().default(300),
  objVal: f.object(SzUint16Obj),
  tupVal: f.tuple(SzUint16Tup),
});

export const SzInt32Obj = object('SzInt32Obj', {
  val: f.int32(),
  opt: f.int32().optional(),
});

export const SzInt32Tup = tuple('SzInt32Tup', [e.int32(), e.int32().nullable()]);

export const SzInt32 = model('SzInt32', {
  id: f.record().id(),
  reqVal: f.int32(),
  optVal: f.int32().optional(),
  nullVal: f.int32().nullable(),
  arrVal: f.int32().array(),
  setVal: f.int32().array().set(),
  dfltVal: f.int32().default(-70000),
  objVal: f.object(SzInt32Obj),
  tupVal: f.tuple(SzInt32Tup),
});

export const SzUint32Obj = object('SzUint32Obj', {
  val: f.uint32(),
  opt: f.uint32().optional(),
});

export const SzUint32Tup = tuple('SzUint32Tup', [e.uint32(), e.uint32().nullable()]);

export const SzUint32 = model('SzUint32', {
  id: f.record().id(),
  reqVal: f.uint32(),
  optVal: f.uint32().optional(),
  nullVal: f.uint32().nullable(),
  arrVal: f.uint32().array(),
  setVal: f.uint32().array().set(),
  dfltVal: f.uint32().default(70000),
  objVal: f.object(SzUint32Obj),
  tupVal: f.tuple(SzUint32Tup),
});

export const SzUint64Obj = object('SzUint64Obj', {
  val: f.uint64(),
  opt: f.uint64().optional(),
});

export const SzUint64Tup = tuple('SzUint64Tup', [e.uint64(), e.uint64().nullable()]);

export const SzUint64 = model('SzUint64', {
  id: f.record().id(),
  reqVal: f.uint64(),
  optVal: f.uint64().optional(),
  nullVal: f.uint64().nullable(),
  arrVal: f.uint64().array(),
  setVal: f.uint64().array().set(),
  dfltVal: f.uint64().default(5),
  objVal: f.object(SzUint64Obj),
  tupVal: f.tuple(SzUint64Tup),
});

export const SzFloat16Obj = object('SzFloat16Obj', {
  val: f.float16(),
  opt: f.float16().optional(),
});

export const SzFloat16Tup = tuple('SzFloat16Tup', [e.float16(), e.float16().nullable()]);

export const SzFloat16 = model('SzFloat16', {
  id: f.record().id(),
  reqVal: f.float16(),
  optVal: f.float16().optional(),
  nullVal: f.float16().nullable(),
  arrVal: f.float16().array(),
  setVal: f.float16().array().set(),
  dfltVal: f.float16().default(1.5),
  objVal: f.object(SzFloat16Obj),
  tupVal: f.tuple(SzFloat16Tup),
});

export const SzFloat32Obj = object('SzFloat32Obj', {
  val: f.float32(),
  opt: f.float32().optional(),
});

export const SzFloat32Tup = tuple('SzFloat32Tup', [e.float32(), e.float32().nullable()]);

export const SzFloat32 = model('SzFloat32', {
  id: f.record().id(),
  reqVal: f.float32(),
  optVal: f.float32().optional(),
  nullVal: f.float32().nullable(),
  arrVal: f.float32().array(),
  setVal: f.float32().array().set(),
  dfltVal: f.float32().default(2.5),
  objVal: f.object(SzFloat32Obj),
  tupVal: f.tuple(SzFloat32Tup),
});

export const SzOwner = model('SzOwner', {
  id: f.record().id(),
  name: f.string(),
  readings: f.reverse('SzReading').array(),
});

export const SzReading = model('SzReading', {
  id: f.record().id(),
  ownerId: f.record(),
  owner: f.relation('SzOwner').field('ownerId'),
  channel: f.uint8(),
  level: f.float32(),
  counter: f.uint64(),
});

export const SzRawHolder = model('SzRawHolder', {
  id: f.record().id(),
  numVal: f.number(),
  anyVal: f.any(),
});
