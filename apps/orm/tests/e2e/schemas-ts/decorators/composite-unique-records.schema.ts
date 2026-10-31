import { f, model, object } from '../../../../src/schema';

export const Attendee = model('Attendee', {
  id: f.record().id(),
  name: f.string(),
  registrations: f.reverse('Registration').array(),
  tickets: f.reverse('Ticket').array(),
  bookings: f.reverse('Booking').array(),
});

export const Workshop = model('Workshop', {
  id: f.record().id(),
  title: f.string(),
  registrations: f.reverse('Registration').array(),
  tickets: f.reverse('Ticket').array(),
});

export const Registration = model(
  'Registration',
  {
    id: f.record().id(),
    attendeeId: f.record(),
    workshopId: f.record(),
    attendee: f.relation('Attendee').field('attendeeId'),
    workshop: f.relation('Workshop').field('workshopId'),
    role: f.string().optional(),
  },
  { unique: { name: 'attendeeWorkshop', fields: ['attendeeId', 'workshopId'] } },
);

export const Ticket = model(
  'Ticket',
  {
    id: f.record().id(),
    attendeeId: f.record(),
    workshopId: f.record(),
    attendee: f.relation('Attendee').field('attendeeId'),
    workshop: f.relation('Workshop').field('workshopId'),
    seat: f.string(),
  },
  {
    index: [
      { name: 'ticketAttendeeWorkshop', fields: ['attendeeId', 'workshopId'] },
      { name: 'ticketAttendeeSeat', fields: ['attendeeId', 'seat'] },
    ],
    unique: { name: 'ticketWorkshopSeat', fields: ['workshopId', 'seat'] },
  },
);

export const Slot = object('Slot', {
  row: f.string(),
});

export const Booking = model(
  'Booking',
  {
    id: f.record().id(),
    attendeeId: f.record(),
    attendee: f.relation('Attendee').field('attendeeId'),
    slot: f.object(Slot),
  },
  {
    index: { name: 'bookingAttendeeRow', fields: ['attendeeId', 'slot.row'] },
    unique: { name: 'bookingAttendeeRowUnique', fields: ['attendeeId', 'slot.row'] },
  },
);
