export type CoursePayoutInput = {
  grossAmountOre: number;
  numberOfSessions: number;
  numberOfWeeks: number;
  participantHasActiveLicense: boolean;
};

export type CoursePayoutBreakdown = {
  grossAmountOre: number;
  paymentFeeOre: number;
  dailyAiFeeOre: number;
  licenseFeeOre: number;
  totalCostsOre: number;
  netRevenueOre: number;
  instructorAmountOre: number;
  platformMarginOre: number;
  applicationFeeAmountOre: number;
};

export type CoursePayoutReleasePolicy = {
  model: "platform_hold_75_25";
  milestonePercent: number;
  firstReleasePercent: number;
  holdbackPercent: number;
  complaintWindowHours: number;
  firstReleaseAmountOre: number;
  holdbackAmountOre: number;
};

export const COURSE_COMMERCE_DEFAULTS = {
  paymentFeePercent: 0.024,
  paymentFeeFixedOre: 200,
  dailyPerSessionOre: 200,
  aiPerCourseOre: 200,
  monthlyLicensePriceOre: 7900,
  courseLicenseDiscount: 0.5,
  maxLicenseMonths: 6,
  platformShare: 0.15,
  instructorShare: 0.85,
  payoutMilestonePercent: 0.75,
  firstReleasePercent: 0.75,
  holdbackPercent: 0.25,
  complaintWindowHours: 72,
} as const;

function wholeOre(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function calculateCoursePayout(input: CoursePayoutInput): CoursePayoutBreakdown {
  const grossAmountOre = wholeOre(input.grossAmountOre);
  const numberOfSessions = wholeOre(input.numberOfSessions);
  const numberOfWeeks = wholeOre(input.numberOfWeeks);

  const paymentFeeOre = wholeOre(
    grossAmountOre * COURSE_COMMERCE_DEFAULTS.paymentFeePercent +
      COURSE_COMMERCE_DEFAULTS.paymentFeeFixedOre
  );

  const dailyAiFeeOre = wholeOre(
    numberOfSessions * COURSE_COMMERCE_DEFAULTS.dailyPerSessionOre +
      COURSE_COMMERCE_DEFAULTS.aiPerCourseOre
  );

  const licenseMonths = Math.min(
    COURSE_COMMERCE_DEFAULTS.maxLicenseMonths,
    Math.max(1, Math.ceil(numberOfWeeks / 4))
  );
  const licenseFeeOre = input.participantHasActiveLicense
    ? 0
    : wholeOre(
        COURSE_COMMERCE_DEFAULTS.monthlyLicensePriceOre *
          COURSE_COMMERCE_DEFAULTS.courseLicenseDiscount *
          licenseMonths
      );

  const totalCostsOre = paymentFeeOre + dailyAiFeeOre + licenseFeeOre;
  const netRevenueOre = Math.max(0, grossAmountOre - totalCostsOre);
  const instructorAmountOre = wholeOre(netRevenueOre * COURSE_COMMERCE_DEFAULTS.instructorShare);
  const platformMarginOre = Math.max(0, netRevenueOre - instructorAmountOre);
  const applicationFeeAmountOre = Math.min(grossAmountOre, totalCostsOre + platformMarginOre);

  return {
    grossAmountOre,
    paymentFeeOre,
    dailyAiFeeOre,
    licenseFeeOre,
    totalCostsOre,
    netRevenueOre,
    instructorAmountOre,
    platformMarginOre,
    applicationFeeAmountOre,
  };
}

export function calculateCoursePayoutReleasePolicy(
  instructorAmountOre: number
): CoursePayoutReleasePolicy {
  const firstReleaseAmountOre = wholeOre(
    instructorAmountOre * COURSE_COMMERCE_DEFAULTS.firstReleasePercent
  );

  return {
    model: "platform_hold_75_25",
    milestonePercent: COURSE_COMMERCE_DEFAULTS.payoutMilestonePercent,
    firstReleasePercent: COURSE_COMMERCE_DEFAULTS.firstReleasePercent,
    holdbackPercent: COURSE_COMMERCE_DEFAULTS.holdbackPercent,
    complaintWindowHours: COURSE_COMMERCE_DEFAULTS.complaintWindowHours,
    firstReleaseAmountOre,
    holdbackAmountOre: Math.max(0, wholeOre(instructorAmountOre) - firstReleaseAmountOre),
  };
}
