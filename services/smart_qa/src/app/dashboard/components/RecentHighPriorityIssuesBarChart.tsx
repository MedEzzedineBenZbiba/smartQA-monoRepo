"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// Updated data representation to match standard QA metrics (Days Unresolved per Priority Case)
const chartData = [
  { issueId: "SEC-104", daysOpen: 14 },
  { issueId: "AUTH-89", daysOpen: 11 },
  { issueId: "DB-302", daysOpen: 9 },
  { issueId: "API-55", daysOpen: 7 },
  { issueId: "UI-812", daysOpen: 6 },
  { issueId: "CORE-12", daysOpen: 4 },
];

const chartConfig = {
  daysOpen: {
    label: "Days Unresolved",
    color: "#e05fa0",
  },
} satisfies ChartConfig;

export function RecentHighPriorityIssuesBarChart() {
  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-4 pb-4">
        <CardTitle className="font-bold text-lg text-gray-900 tracking-tight">
          Top Critical Backlog
        </CardTitle>
        <CardDescription className="text-xs font-medium text-gray-400 uppercase">
          Oldest High-Priority Actions Remaining Open
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ChartContainer config={chartConfig} className="h-[380px] w-full">
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 20, right: 10, left: 0, bottom: 10 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="#f3f4f6"
            />
            <XAxis
              dataKey="issueId"
              tickLine={false}
              tickMargin={12}
              axisLine={false}
              className="text-xs font-semibold text-gray-400"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              className="text-xs text-gray-400"
              label={{
                value: "Days Active",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                className: "fill-gray-400 text-xs font-medium",
              }}
            />
            <ChartTooltip
              cursor={{ fill: "#f9fafb" }}
              content={<ChartTooltipContent hideLabel={false} />}
            />
            <Bar
              dataKey="daysOpen"
              fill="#ef4444"
              radius={[6, 6, 0, 0]}
              maxBarSize={50}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
