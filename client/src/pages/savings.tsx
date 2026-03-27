import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const token = localStorage.getItem("token");

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
};

type Goal = {
  id: number;
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline: string | null;
};

export default function Savings() {
  const queryClient = useQueryClient();
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [contributingTo, setContributingTo] = useState<Goal | null>(null);
  const [newGoal, setNewGoal] = useState({ name: "", targetAmount: "", deadline: "" });
  const [contribution, setContribution] = useState({ amount: "", note: "" });

  const { data: goals, isLoading, isError } = useQuery<Goal[]>({
    queryKey: ["savings-goals"],
    queryFn: () => fetchWithAuth("/api/savings/goals"),
  });

  const createGoal = useMutation({
    mutationFn: (data: typeof newGoal) =>
        fetchWithAuth("/api/savings/goals", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savings-goals"] });
      setShowNewGoal(false);
      setNewGoal({ name: "", targetAmount: "", deadline: "" });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: (id: number) =>
        fetchWithAuth(`/api/savings/goals/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["savings-goals"] }),
  });

  const addContribution = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof contribution }) =>
        fetchWithAuth(`/api/savings/goals/${id}/contributions`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savings-goals"] });
      setContributingTo(null);
      setContribution({ amount: "", note: "" });
    },
  });

  const getProgress = (current: string, target: string) => {
    const pct = (parseFloat(current) / parseFloat(target)) * 100;
    return Math.min(pct, 100).toFixed(1);
  };

  return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Savings Goals</h1>
          <button
              onClick={() => setShowNewGoal(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
          >
            + New Goal
          </button>
        </div>

        {/* New Goal Form */}
        {showNewGoal && (
            <div className="border rounded-xl p-4 space-y-3 bg-muted/40">
              <h2 className="font-semibold">Create Goal</h2>
              <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Goal name (e.g. Trip to Japan)"
                  value={newGoal.name}
                  onChange={e => setNewGoal(g => ({ ...g, name: e.target.value }))}
              />
              <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Target amount"
                  type="number"
                  value={newGoal.targetAmount}
                  onChange={e => setNewGoal(g => ({ ...g, targetAmount: e.target.value }))}
              />
              <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Deadline (optional)"
                  type="date"
                  value={newGoal.deadline}
                  onChange={e => setNewGoal(g => ({ ...g, deadline: e.target.value }))}
              />
              <div className="flex gap-2">
                <button
                    onClick={() => createGoal.mutate(newGoal)}
                    disabled={createGoal.isPending}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createGoal.isPending ? "Creating..." : "Create"}
                </button>
                <button
                    onClick={() => setShowNewGoal(false)}
                    className="border px-4 py-2 rounded-lg text-sm hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
        )}

        {/* Goals List */}
        {isLoading && <p className="text-muted-foreground">Loading goals...</p>}
        {isError && <p className="text-red-500">Failed to load goals.</p>}
        {goals && goals.length === 0 && (
            <p className="text-muted-foreground">No savings goals yet. Create one above!</p>
        )}
        {goals && goals.map(goal => {
          const progress = getProgress(goal.currentAmount, goal.targetAmount);
          return (
              <div key={goal.id} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{goal.name}</h3>
                    {goal.deadline && (
                        <p className="text-xs text-muted-foreground">
                          Deadline: {new Date(goal.deadline).toLocaleDateString()}
                        </p>
                    )}
                  </div>
                  <button
                      onClick={() => deleteGoal.mutate(goal.id)}
                      className="text-xs text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>${parseFloat(goal.currentAmount).toFixed(2)} saved</span>
                    <span className="text-muted-foreground">${parseFloat(goal.targetAmount).toFixed(2)} goal</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div
                        className="bg-indigo-600 h-3 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-right">{progress}% complete</p>
                </div>

                <button
                    onClick={() => setContributingTo(goal)}
                    className="text-sm text-indigo-600 hover:underline"
                >
                  + Add Contribution
                </button>
              </div>
          );
        })}

        {/* Contribution Modal */}
        {contributingTo && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-background border rounded-xl p-6 space-y-4 w-full max-w-md mx-4">
                <h2 className="font-semibold text-lg">Add to "{contributingTo.name}"</h2>
                <input
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Amount"
                    type="number"
                    value={contribution.amount}
                    onChange={e => setContribution(c => ({ ...c, amount: e.target.value }))}
                />
                <input
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Note (optional)"
                    value={contribution.note}
                    onChange={e => setContribution(c => ({ ...c, note: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                      onClick={() => addContribution.mutate({ id: contributingTo.id, data: contribution })}
                      disabled={addContribution.isPending}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {addContribution.isPending ? "Saving..." : "Add"}
                  </button>
                  <button
                      onClick={() => setContributingTo(null)}
                      className="border px-4 py-2 rounded-lg text-sm hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
        )}
      </div>
  );
}