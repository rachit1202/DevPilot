'use client';

import React, { useEffect, useState } from 'react';
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
  Activity,
  AlertCircle,
  Share2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/api';

interface DashboardMetrics {
  totalPosts: number;
  draftPosts: number;
  inReviewPosts: number;
  approvedPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  rejectedPosts: number;
  ideaPosts: number;
  totalMedia: number;
}

interface UpcomingSchedule {
  id: string;
  scheduledAt: string;
  status: string;
  contentPost: {
    id: string;
    title: string;
    caption: string;
    contentType: string;
    category: string;
    status: string;
    mediaThumbnail: string | null;
  };
}

interface RecentActivity {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: any;
  createdAt: string;
  userName: string;
  userRole: string | null;
}

interface RecentPost {
  id: string;
  title: string;
  status: string;
  contentType: string;
  category: string;
  createdAt: string;
  creatorName: string;
  creatorRole: string;
  mediaThumbnail: string | null;
}

interface DashboardData {
  metrics: DashboardMetrics;
  upcomingSchedules: UpcomingSchedule[];
  recentActivity: RecentActivity[];
  recentPosts: RecentPost[];
}

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboardSummary() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiRequest<{ success: boolean; data: DashboardData }>('/dashboard/summary');
        setData(response.data);
      } catch (err: any) {
        console.error('Failed to load dashboard summary:', err);
        setError(err.message || 'Failed to load dashboard overview data.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardSummary();
  }, []);

  const metrics = data?.metrics || {
    totalPosts: 0,
    draftPosts: 0,
    inReviewPosts: 0,
    approvedPosts: 0,
    scheduledPosts: 0,
    publishedPosts: 0,
    rejectedPosts: 0,
    ideaPosts: 0,
    totalMedia: 0,
  };

  const formatScheduleDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const formatActivityDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

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

      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards Grid - Real PostgreSQL Data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Content Posts"
          value={isLoading ? '...' : metrics.totalPosts}
          change={`${metrics.draftPosts} draft, ${metrics.approvedPosts} approved`}
          isPositive={true}
          icon={FileText}
          iconColor="purple"
          isSample={false}
        />
        <StatCard
          title="Published Posts"
          value={isLoading ? '...' : metrics.publishedPosts}
          change={`${metrics.publishedPosts} live on channels`}
          isPositive={true}
          icon={Send}
          iconColor="cyan"
          isSample={false}
        />
        <StatCard
          title="Scheduled Content"
          value={isLoading ? '...' : metrics.scheduledPosts}
          change={
            data?.upcomingSchedules && data.upcomingSchedules.length > 0
              ? `Next: ${formatScheduleDate(data.upcomingSchedules[0].scheduledAt)}`
              : 'No upcoming posts queued'
          }
          isPositive={true}
          icon={Clock}
          iconColor="warning"
          isSample={false}
        />
        <StatCard
          title="Pending Approvals"
          value={isLoading ? '...' : metrics.inReviewPosts}
          change={metrics.inReviewPosts > 0 ? 'Requires human review' : 'All clear'}
          isPositive={metrics.inReviewPosts === 0}
          icon={CheckCircle2}
          iconColor="success"
          isSample={false}
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
                <span>Review Pending ({isLoading ? '...' : metrics.inReviewPosts})</span>
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
              <CardDescription>Next queued posts for CodeCulture channels from PostgreSQL</CardDescription>
            </div>
            <Link href="/calendar" className="text-xs text-devpilot-purple hover:underline">
              View Calendar
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="text-center py-8 text-devpilot-muted text-xs">Loading scheduled items...</div>
            ) : data?.upcomingSchedules && data.upcomingSchedules.length > 0 ? (
              data.upcomingSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="p-3 rounded-lg bg-devpilot-bg/50 border border-devpilot-border flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-devpilot-purple/10 border border-devpilot-purple/20 flex items-center justify-center shrink-0 text-devpilot-purple overflow-hidden">
                      {schedule.contentPost.mediaThumbnail ? (
                        <img
                          src={schedule.contentPost.mediaThumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Flame className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-devpilot-text truncate">
                        {schedule.contentPost.title}
                      </p>
                      <p className="text-[11px] text-devpilot-muted truncate">
                        {schedule.contentPost.category} • {formatScheduleDate(schedule.scheduledAt)}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded shrink-0">
                    {schedule.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-devpilot-muted text-xs border border-dashed border-devpilot-border rounded-lg">
                <Clock className="w-6 h-6 mx-auto mb-2 text-devpilot-muted/50" />
                No upcoming scheduled posts queued in database.
              </div>
            )}
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
            {isLoading ? (
              <div className="text-center py-8 text-devpilot-muted text-xs">Loading activity logs...</div>
            ) : data?.recentActivity && data.recentActivity.length > 0 ? (
              data.recentActivity.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-devpilot-purple mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-devpilot-text font-medium truncate">
                      {log.action}
                      {log.entityType ? ` on ${log.entityType}` : ''}
                    </p>
                    <p className="text-[11px] text-devpilot-muted">
                      {log.userName} • {formatActivityDate(log.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-devpilot-muted text-xs border border-dashed border-devpilot-border rounded-lg">
                <Activity className="w-6 h-6 mx-auto mb-2 text-devpilot-muted/50" />
                No audit activity logs recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Social Accounts & Performance Notice (Phase 5 Placeholder as instructed) */}
      <Card className="border-devpilot-border/60 bg-devpilot-bg/40">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-devpilot-cyan/10 border border-devpilot-cyan/20 flex items-center justify-center shrink-0 text-devpilot-cyan">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-devpilot-text">
                Social Accounts & Live Reach Metrics
              </h4>
              <p className="text-[11px] text-devpilot-muted">
                External social media OAuth, multi-channel publishing, and live analytics integration are scheduled for Phase 5.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-medium px-2.5 py-1 rounded-full bg-devpilot-cyan/10 text-devpilot-cyan border border-devpilot-cyan/20 whitespace-nowrap">
            Social Accounts Phase 5 (Not Connected)
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
