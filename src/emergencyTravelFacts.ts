// Safe emergency identity for two different roles.
// Never read the Traveler's prior trip to describe the Operator's active work,
// or print a simulated vehicle/Travel Number when no real assignment exists.
export type EmergencyTravelFacts = {
  hasOperator: boolean;
  operator: string;
  vehicle: string;
  plate: string;
  tripNo: string;
  dep: string;
  arr: string;
  totalCents?: number;
  date?: string;
};
type Input = {
  role: 'operator' | 'traveler';
  activeOperatorTravel?: {
    rideId?: string; tripNo?: string; pickup: string; dest: string;
  } | null;
  operatorName?: string | null;
  operatorVehicle?: { car: string; plate: string } | null;
  travelerActive: boolean;
  matchedOperator?: { name?: string; car?: string; plate?: string } | null;
  travelerTrip?: { no: string; dep: string; arr: string; total: number; date: string } | null;
};
const empty: EmergencyTravelFacts = {
  hasOperator: false, operator: '', vehicle: '', plate: '',
  tripNo: '', dep: '', arr: '',
};

export function resolveEmergencyTravelFacts(input: Input): EmergencyTravelFacts {
  const current = input.activeOperatorTravel;
  if (input.role === 'operator' && current?.rideId && current.tripNo) {
    return {
      hasOperator: true,
      operator: (input.operatorName || '').trim(),
      vehicle: (input.operatorVehicle?.car || '').trim(),
      plate: (input.operatorVehicle?.plate || '').trim(),
      tripNo: current.tripNo,
      dep: current.pickup,
      arr: current.dest,
    };
  }
  // No fallback to a Traveler role's cached trip while signed in as Operator.
  if (input.role === 'operator') return empty;
  if (!input.travelerActive || !input.matchedOperator || !input.travelerTrip?.no)
    return empty;
  return {
    hasOperator: true,
    operator: (input.matchedOperator.name || '').trim(),
    vehicle: (input.matchedOperator.car || '').trim(),
    plate: (input.matchedOperator.plate || '').trim(),
    tripNo: input.travelerTrip.no,
    dep: input.travelerTrip.dep,
    arr: input.travelerTrip.arr,
    totalCents: Number.isFinite(input.travelerTrip.total) ?
      Math.round(input.travelerTrip.total * 100) : undefined,
    date: input.travelerTrip.date,
  };
}
