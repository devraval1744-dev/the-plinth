import { countFavorites } from './favorite.service';
import { getCustomerVisitCounts, getNextVisit, VisitView } from './visit.service';
import { getCustomerLoanCounts, getLatestLoan, LoanView } from './loan.service';
import { getUnreadCount } from './notification.service';
import { getRecentSearches, getRecentViews, RecentSearch } from './activity.service';
import { buildUserProfile, summariseProfile, ProfileInsights } from './recommendation.service';
import { PublicProperty } from './property.service';

export interface CustomerDashboard {
  counts: {
    saved: number;
    visitsUpcoming: number;
    visitsTotal: number;
    loansActive: number;
    loansTotal: number;
    unreadNotifications: number;
  };
  nextVisit: VisitView | null;
  latestLoan: LoanView | null;
  insights: ProfileInsights;
  recentViews: PublicProperty[];
  recentSearches: RecentSearch[];
}

/** Everything the customer home page needs in one round trip (feeds load separately). */
export async function getCustomerDashboard(userId: string): Promise<CustomerDashboard> {
  const [saved, visits, nextVisit, loans, latestLoan, unread, profile, recentViews, recentSearches] =
    await Promise.all([
      countFavorites(userId),
      getCustomerVisitCounts(userId),
      getNextVisit(userId),
      getCustomerLoanCounts(userId),
      getLatestLoan(userId),
      getUnreadCount(userId),
      buildUserProfile(userId),
      getRecentViews(userId, 8),
      getRecentSearches(userId, 6),
    ]);

  return {
    counts: {
      saved,
      visitsUpcoming: visits.upcoming,
      visitsTotal: visits.total,
      loansActive: loans.active,
      loansTotal: loans.total,
      unreadNotifications: unread,
    },
    nextVisit,
    latestLoan,
    insights: summariseProfile(profile),
    recentViews,
    recentSearches,
  };
}
