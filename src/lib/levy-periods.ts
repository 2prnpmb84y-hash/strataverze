/**
 * Pure functions for generating levy periods from a budget and frequency.
 * Extracted from levies/generate/actions.ts for testability.
 */

export interface LevyPeriod {
  title: string;
  amount: number;
  dueDate: string;
}

/**
 * Build levy periods for a given frequency, start date, and annual budget.
 *
 * The last period in a split (quarterly or half-yearly) absorbs any rounding
 * remainder so that all periods sum exactly to the annual budget.
 *
 * @param frequency - "QUARTERLY" | "HALF_YEARLY" | "ANNUALLY"
 * @param startDate - The financial year start date
 * @param annualBudget - Total annual budget amount
 * @param prefix - Optional title prefix (e.g. "Admin Fund")
 */
export function buildPeriods(
  frequency: string,
  startDate: Date,
  annualBudget: number,
  prefix: string,
): LevyPeriod[] {
  const year = startDate.getFullYear();
  const endYear = year + 1;
  const fyLabel = `FY${String(endYear).slice(2)}`;

  switch (frequency) {
    case "QUARTERLY": {
      const quarterAmount = Math.round((annualBudget / 4) * 100) / 100;
      // Adjust last quarter for rounding
      const lastQuarterAmount =
        Math.round((annualBudget - quarterAmount * 3) * 100) / 100;

      const quarters = [
        { label: "Q1", monthsOffset: 0 },
        { label: "Q2", monthsOffset: 3 },
        { label: "Q3", monthsOffset: 6 },
        { label: "Q4", monthsOffset: 9 },
      ];

      return quarters.map((q, i) => {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + q.monthsOffset);

        const titleParts = [prefix, q.label, fyLabel].filter(Boolean);
        return {
          title: titleParts.join(" "),
          amount: i === 3 ? lastQuarterAmount : quarterAmount,
          dueDate: dueDate.toISOString(),
        };
      });
    }
    case "HALF_YEARLY": {
      const halfAmount = Math.round((annualBudget / 2) * 100) / 100;
      const lastHalfAmount =
        Math.round((annualBudget - halfAmount) * 100) / 100;

      return [
        {
          title: [prefix, "H1", fyLabel].filter(Boolean).join(" "),
          amount: halfAmount,
          dueDate: startDate.toISOString(),
        },
        {
          title: [prefix, "H2", fyLabel].filter(Boolean).join(" "),
          amount: lastHalfAmount,
          dueDate: new Date(
            startDate.getFullYear(),
            startDate.getMonth() + 6,
            startDate.getDate(),
          ).toISOString(),
        },
      ];
    }
    case "ANNUALLY":
    default: {
      return [
        {
          title: [prefix, "Annual Levy", fyLabel].filter(Boolean).join(" "),
          amount: annualBudget,
          dueDate: startDate.toISOString(),
        },
      ];
    }
  }
}
