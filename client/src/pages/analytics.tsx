import { useQuery } from "@tanstack/react-query";
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line
} from "recharts";

const token = localStorage.getItem("token");

const fetchWithAuth = async (url: string) => {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
};

const FALLBACK_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7"];

export default function Analytics() {
    const { data: categoryData, isLoading: loadingCategory, isError: errorCategory } =
        useQuery({ queryKey: ["spending-by-category"], queryFn: () => fetchWithAuth("/api/analytics/spending-by-category") });

    const { data: trendsData, isLoading: loadingTrends, isError: errorTrends } =
        useQuery({ queryKey: ["monthly-trends"], queryFn: () => fetchWithAuth("/api/analytics/monthly-trends") });

    const { data: budgetData, isLoading: loadingBudget, isError: errorBudget } =
        useQuery({ queryKey: ["budget-vs-actual"], queryFn: () => fetchWithAuth("/api/analytics/budget-vs-actual") });

    return (
        <div className="p-6 space-y-10">
            <h1 className="text-2xl font-bold">Analytics</h1>

            {/* Spending by Category */}
            <section>
                <h2 className="text-lg font-semibold mb-4">Spending by Category</h2>
                {loadingCategory && <p className="text-muted-foreground">Loading...</p>}
                {errorCategory && <p className="text-red-500">Failed to load category data.</p>}
                {categoryData && categoryData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={categoryData}
                                dataKey="total"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={120}
                                paddingAngle={3}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {categoryData.map((entry: any, index: number) => (
                                    <Cell
                                        key={entry.name}
                                        fill={FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                                    />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                )}
                {categoryData && categoryData.length === 0 && (
                    <p className="text-muted-foreground">No spending data yet.</p>
                )}
            </section>

            {/* Monthly Trends */}
            <section>
                <h2 className="text-lg font-semibold mb-4">Monthly Trends</h2>
                {loadingTrends && <p className="text-muted-foreground">Loading...</p>}
                {errorTrends && <p className="text-red-500">Failed to load trends data.</p>}
                {trendsData && trendsData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={trendsData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                            <Legend />
                            <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                )}
                {trendsData && trendsData.length === 0 && (
                    <p className="text-muted-foreground">No trends data yet.</p>
                )}
            </section>

            {/* Budget vs Actual */}
            <section>
                <h2 className="text-lg font-semibold mb-4">Budget vs Actual</h2>
                {loadingBudget && <p className="text-muted-foreground">Loading...</p>}
                {errorBudget && <p className="text-red-500">Failed to load budget data.</p>}
                {budgetData && budgetData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={budgetData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="category" />
                            <YAxis />
                            <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                            <Legend />
                            <Bar dataKey="budget" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="actual" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
                {budgetData && budgetData.length === 0 && (
                    <p className="text-muted-foreground">No budget data yet.</p>
                )}
            </section>
        </div>
    );
}