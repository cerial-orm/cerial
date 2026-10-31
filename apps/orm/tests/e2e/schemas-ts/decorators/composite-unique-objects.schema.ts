import { f, model, object } from '../../../../src/schema';

export const Location = object('Location', {
  city: f.string(),
  zip: f.string(),
  street: f.string().optional(),
});

export const Warehouse = model(
  'Warehouse',
  {
    id: f.record().id(),
    name: f.string().index(),
    location: f.object(Location),
    capacity: f.int().optional(),
  },
  {
    unique: [
      { name: 'cityZip', fields: ['location.city', 'location.zip'] },
      { name: 'nameCity', fields: ['name', 'location.city'] },
    ],
  },
);

export const Dock = object('Dock', {
  bay: f.string(),
  level: f.int(),
});

export const Depot = model(
  'Depot',
  {
    id: f.record().id(),
    label: f.string(),
    dock: f.object(Dock),
  },
  {
    index: [
      { name: 'dockBayLevel', fields: ['dock.bay', 'dock.level'] },
      { name: 'labelDockBay', fields: ['label', 'dock.bay'] },
    ],
  },
);
