'use client';

import React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Send,
  Clock,
  CheckCircle2,
  Sparkles,
  Compass,
  ArrowRight,
  TrendingUp,
  Image as ImageIcon,
  Flame,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardOverviewPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name || 'Commander'}`}
        description="DevPilot command center is operational. Manage CodeCulture content, review pending approvals, and schedule posts."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/content">
              <Button variant="secondary" size="sm">
                View Content Library
              </Button>
            </Link>
            <Link href="/approvals">
              <Button size="sm">
                Review Approvals
              </Button>
            </Link>
          </div>
        }
      />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Content Posts"
          value="24"
          change="+4 this week"
          isPositive={true}
          icon={FileText}
          iconColor="purple"
          isSample={true}
        />
        <StatCard
          title="Published Posts"
          value="18"
          change="+2 published"
          isPositive={true}
          icon={Send}
          iconColor="cyan"
          isSample={true}
        />
        <StatCard
          title="Scheduled Content"
          value="4"
          change="Next: Tomorrow, 10:00 AM"
          isPositive={true}
          icon={Clock}
          iconColor="warning"
          isSample={true}
        />
        <StatCard
          title="Pending Approvals"
          value="2"
          change="Requires your review"
          isPositive={false}
          icon={CheckCircle2}
          iconColor="success"
          isSample={true}
        />
      </div>

      {/* Quick Action Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:border-devpilot-purple/50 transition-all group">
          <CardHeader>
            <div className="flex items-center gap-2 text-devpilot-purple mb-1">
              <Sparkles className="w-4 h-4" />
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">
                AI Studio
              </span>
            </div>
            <CardTitle>Generate Content Concepts</CardTitle>
            <CardDescription>
              Create coding memes, carousels, and developer tips aligned with CodeCulture tone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/studio">
              <Button variant="secondary" size="sm" className="w-full group-hover:border-devpilot-purple/40">
                <span>Open Studio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:border-devpilot-cyan/50 transition-all group">
          <CardHeader>
            <div className="flex items-center gap-2 text-devpilot-cyan mb-1">
              <Compass className="w-4 h-4" />
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">
                Trend Explorer
              </span>
            </div>
            <CardTitle>Research Developer Trends</CardTitle>
            <CardDescription>
              Monitor GitHub trending repositories and developer news to spark viral discussions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/trends">
              <Button variant="secondary" size="sm" className="w-full group-hover:border-devpilot-cyan/40">
                <span>Explore Trends</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:border-devpilot-success/50 transition-all group">
          <CardHeader>
            <div className="flex items-center gap-2 text-devpilot-success mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">
                Approval Gate
              </span>
            </div>
            <CardTitle>Human-in-the-Loop Review</CardTitle>
            <CardDescription>
              Zero public publishing occurs without strict human verification and sign-off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/approvals">
              <Button variant="secondary" size="sm" className="w-full group-hover:border-devpilot-success/40">
                <span>Review Pending (2)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout: Upcoming Schedule & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Content */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>Upcoming Scheduled Posts</CardTitle>
              <CardDescription>Next queued posts for CodeCulture channels</CardDescription>
            </div>
            <Link href="/calendar" className="text-xs text-devpilot-purple hover:underline">
              View Calendar
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Sample Scheduled Item 1 */}
            <div className="p-3 rounded-lg bg-devpilot-bg/50 border border-devpilot-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-center justify-center shrink-0 text-devpilot-purple">
                  <Flame className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-devpilot-text truncate">
                    10 Modern CSS Features You Should Be Using in 2026
                  </p>
                  <p className="text-[11px] text-devpilot-muted truncate">
                    Web Dev Tips • Tomorrow, 10:00 AM • Instagram
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded shrink-0">
                SCHEDULED
              </span>
            </div>

            {/* Sample Scheduled Item 2 */}
            <div className="p-3 rounded-lg bg-devpilot-bg/50 border border-devpilot-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-devpilot-cyan/10 border border-devpilot-cyan/20 flex items-center justify-center shrink-0 text-devpilot-cyan">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-devpilot-text truncate">
                    When the client says "It's just a small change" (Meme)
                  </p>
                  <p className="text-[11px] text-devpilot-muted truncate">
                    Coding Memes • Wednesday, 4:00 PM • Multi-platform
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded shrink-0">
                SCHEDULED
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>Recent Activity Trail</CardTitle>
              <CardDescription>Live state events recorded in PostgreSQL audit logs</CardDescription>
            </div>
            <Link href="/settings/logs" className="text-xs text-devpilot-purple hover:underline">
              All Logs
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 text-xs">
              <div className="w-2 h-2 rounded-full bg-devpilot-purple mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-devpilot-text font-medium truncate">
                  Owner session authenticated via HttpOnly cookie
                </p>
                <p className="text-[11px] text-devpilot-muted">USER_LOGIN • Just now</p>
              </div>
            </div>

            <div className="flex items-start gap-3 text-xs">
              <div className="w-2 h-2 rounded-full bg-devpilot-cyan mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-devpilot-text font-medium truncate">
                  CodeCulture default brand identity seeded
                </p>
                <p className="text-[11px] text-devpilot-muted">SYSTEM_BOOTSTRAPPED • Milestone 1.1</p>
              </div>
            </div>

            <div className="flex items-start gap-3 text-xs">
              <div className="w-2 h-2 rounded-full bg-devpilot-success mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-devpilot-text font-medium truncate">
                  PostgreSQL 18.7 database schema migrated (10 tables)
                </p>
                <p className="text-[11px] text-devpilot-muted">DB_MIGRATION • Milestone 1.1</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
