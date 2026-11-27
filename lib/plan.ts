// Capacity-based forecast for the next festival (the strategy deck's model).
// Attendees = capacity × productivity × historical show-up. Every input is an
// editable, labelled ASSUMPTION; history-derived defaults say where they come from.

export interface PlanInputs {
  activeColleges: number; registrationsPerCollege: number;
  activeAmbassadors: number; registrationsPerAmbassador: number;
  referralsPerRegistrant: number;
  paidBudgetInr: number; paidCostPerRegistrationInr: number;
  organicCommunityRegistrations: number; organicCommunityAttendees: number;
  showUpPartnerships: number; showUpAmbassadors: number; showUpReferrals: number; showUpPaid: number;
  benchmarkAttendees: number;
}

export const DEFAULT_PLAN_INPUTS: PlanInputs = {
  activeColleges: 30, registrationsPerCollege: 42,
  activeAmbassadors: 50, registrationsPerAmbassador: 20,
  referralsPerRegistrant: 0.14,
  paidBudgetInr: 10000, paidCostPerRegistrationInr: 137,
  organicCommunityRegistrations: 450, organicCommunityAttendees: 360,
  showUpPartnerships: 0.86, showUpAmbassadors: 0.75, showUpReferrals: 0.79, showUpPaid: 0.5,
  benchmarkAttendees: 1925,
};

export const STRETCH_OVERRIDES: Partial<PlanInputs> = {
  activeColleges: 35, registrationsPerCollege: 45, activeAmbassadors: 55, registrationsPerAmbassador: 22, referralsPerRegistrant: 0.21,
};

export const INPUT_META: Record<keyof PlanInputs, { label: string; unit?: string; basis: string; step?: number }> = {
  activeColleges: { label: "Active partner colleges", basis: "Plan assumption (2 partnership volunteers)", step: 1 },
  registrationsPerCollege: { label: "Registrations per college", basis: "Pilot hypothesis; no historical per-college count exists", step: 1 },
  activeAmbassadors: { label: "Active ambassadors", basis: "Plan assumption (1 coordinator)", step: 1 },
  registrationsPerAmbassador: { label: "Registrations per ambassador", basis: "Pilot hypothesis; no historical ambassador count exists", step: 1 },
  referralsPerRegistrant: { label: "Referrals per registrant (seed)", basis: "History: 350 referral registrations ÷ 2,450 other registrations ≈ 0.14", step: 0.01 },
  paidBudgetInr: { label: "Paid social budget", unit: "₹", basis: "Capped pilot", step: 1000 },
  paidCostPerRegistrationInr: { label: "Paid cost per registration", unit: "₹", basis: "History: ₹93,000 ÷ 680 registrations", step: 1 },
  organicCommunityRegistrations: { label: "Organic + community registrations", basis: "History carried forward (250 + 200)", step: 10 },
  organicCommunityAttendees: { label: "Organic + community attendees", basis: "History carried forward (195 + 165); retention is a risk", step: 10 },
  showUpPartnerships: { label: "Show-up: partnerships", basis: "History: 385 of 450 registrants attended", step: 0.01 },
  showUpAmbassadors: { label: "Show-up: ambassadors", basis: "History: 390 of 520", step: 0.01 },
  showUpReferrals: { label: "Show-up: referrals", basis: "History: 275 of 350", step: 0.01 },
  showUpPaid: { label: "Show-up: paid social", basis: "History: 340 of 680", step: 0.01 },
  benchmarkAttendees: { label: "Benchmark (last cycle, campaign-attributed)", basis: "History: 2,050 verified visitors minus 125 walk-ins", step: 1 },
};

export function forecast(p: PlanInputs) {
  const colRegs = p.activeColleges * p.registrationsPerCollege;
  const ambRegs = p.activeAmbassadors * p.registrationsPerAmbassador;
  const paidRegs = p.paidCostPerRegistrationInr > 0 ? p.paidBudgetInr / p.paidCostPerRegistrationInr : 0;
  const seeds = colRegs + ambRegs + paidRegs; // organic/community excluded from referral seeds (conservative)
  const refRegs = seeds * p.referralsPerRegistrant;
  const channels = [
    { channel: "College partnerships", driver: `${p.activeColleges} colleges × ${p.registrationsPerCollege}`, registrations: colRegs, showUp: p.showUpPartnerships, attendees: colRegs * p.showUpPartnerships },
    { channel: "Campus ambassadors", driver: `${p.activeAmbassadors} active × ${p.registrationsPerAmbassador}`, registrations: ambRegs, showUp: p.showUpAmbassadors, attendees: ambRegs * p.showUpAmbassadors },
    { channel: "Student referrals", driver: `${Math.round(seeds).toLocaleString("en-IN")} seeds × ${p.referralsPerRegistrant}`, registrations: refRegs, showUp: p.showUpReferrals, attendees: refRegs * p.showUpReferrals },
    { channel: "Paid social pilot", driver: `₹${p.paidBudgetInr.toLocaleString("en-IN")} ÷ ₹${p.paidCostPerRegistrationInr}`, registrations: paidRegs, showUp: p.showUpPaid, attendees: paidRegs * p.showUpPaid },
    { channel: "Organic + community", driver: "carried forward", registrations: p.organicCommunityRegistrations, showUp: p.organicCommunityRegistrations ? p.organicCommunityAttendees / p.organicCommunityRegistrations : 0, attendees: p.organicCommunityAttendees },
  ];
  const totalRegs = channels.reduce((s, c) => s + c.registrations, 0);
  const totalAtt = channels.reduce((s, c) => s + c.attendees, 0);
  // Break-even: scale per-college and per-ambassador productivity by m until total = benchmark.
  const perM = p.activeColleges * p.registrationsPerCollege * (p.showUpPartnerships + p.referralsPerRegistrant * p.showUpReferrals)
    + p.activeAmbassadors * p.registrationsPerAmbassador * (p.showUpAmbassadors + p.referralsPerRegistrant * p.showUpReferrals);
  const fixed = totalAtt - perM;
  const breakEvenM = perM > 0 ? (p.benchmarkAttendees - fixed) / perM : null;
  return {
    channels, totalRegistrations: totalRegs, totalAttendees: totalAtt,
    vsBenchmarkPct: p.benchmarkAttendees ? totalAtt / p.benchmarkAttendees - 1 : null,
    breakEven: breakEvenM === null ? null : {
      productivityMultiplier: breakEvenM, shortfallPct: 1 - breakEvenM,
      registrationsPerCollege: p.registrationsPerCollege * breakEvenM, registrationsPerAmbassador: p.registrationsPerAmbassador * breakEvenM,
    },
    sensitivity: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1].map((m) => ({ multiplier: m, attendees: fixed + perM * m })),
    upsideNotCounted: { arrivalSupportMax: Math.round(totalRegs * 0.03), note: "Up to +3 pts show-up across registrations; excluded from targets." },
  };
}
