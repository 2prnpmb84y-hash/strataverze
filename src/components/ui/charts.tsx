"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const GRID_STROKE = "#E5E7EB";
const AXIS_TICK = { fontSize: 12, fill: "#6B7280" };
const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid #E5E7EB",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    fontSize: 13,
  },
};

/* ------------------------------------------------------------------ */
/*  FundLineChart                                                      */
/*  3 series: Capital Works #C9A7E8, Admin Fund mint, Total #5BB8F5    */
/* ------------------------------------------------------------------ */

export type FundLinePoint = {
  period: string;
  capitalWorks?: number;
  adminFund?: number;
  total?: number;
};

export function FundLineChart({
  data,
  fundNames,
  height = 240,
}: {
  data: FundLinePoint[];
  /** The series names, from the building's FUND_CATALOGUE (for example its shortLabel for each fund). */
  fundNames: { capitalWorks: string; adminFund: string };
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="period" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={60} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Line
          type="monotone"
          dataKey="capitalWorks"
          name={fundNames.capitalWorks}
          stroke="#C9A7E8"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="adminFund"
          name={fundNames.adminFund}
          stroke="var(--color-mint)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="total"
          name="Total"
          stroke="#5BB8F5"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  AgeingBarChart                                                     */
/*  Date buckets: overdue coral, current/future blue                   */
/* ------------------------------------------------------------------ */

export type AgeingBarPoint = {
  bucket: string;
  amount: number;
  isOverdue?: boolean;
};

export function AgeingBarChart({
  data,
  height = 240,
}: {
  data: AgeingBarPoint[];
  height?: number;
}) {
  // Transform data to split overdue vs current for separate bar colours
  const transformed = data.map((d) => ({
    bucket: d.bucket,
    overdue: d.isOverdue ? d.amount : 0,
    current: d.isOverdue ? 0 : d.amount,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={transformed} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={60} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar
          dataKey="overdue"
          name="Overdue"
          fill="var(--color-coral)"
          radius={[4, 4, 0, 0]}
          barSize={24}
        />
        <Bar
          dataKey="current"
          name="Current / Future"
          fill="#5BB8F5"
          radius={[4, 4, 0, 0]}
          barSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  CashInOutChart                                                     */
/*  Grouped bars by month: cash in blue, cash out grey                 */
/* ------------------------------------------------------------------ */

export type CashInOutPoint = {
  month: string;
  cashIn: number;
  cashOut: number;
};

export function CashInOutChart({
  data,
  height = 240,
}: {
  data: CashInOutPoint[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={60} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar
          dataKey="cashIn"
          name="Cash In"
          fill="#5BB8F5"
          radius={[4, 4, 0, 0]}
          barSize={20}
        />
        <Bar
          dataKey="cashOut"
          name="Cash Out"
          fill="#9CA3AF"
          radius={[4, 4, 0, 0]}
          barSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
