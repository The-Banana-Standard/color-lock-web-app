import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUsageStatsCallable, UsageStatsEntry } from '../services/firebaseService';
import '../scss/usageStats.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faUsers, faGamepad, faFire } from '@fortawesome/free-solid-svg-icons';

type TimeFilter = '7days' | '30days' | '90days' | 'alltime';
type MetricType = 'users' | 'attempts' | 'streaks';
type StreakType = 'puzzleStreak' | 'easyGoal' | 'mediumGoal' | 'hardGoal';

const STREAK_TYPE_COLORS: Record<StreakType, string> = {
  puzzleStreak: '#fb997f',
  easyGoal: '#afc053',
  mediumGoal: '#f7ac4b',
  hardGoal: '#4ca9ea',
};

const STREAK_TYPE_LABELS: Record<StreakType, string> = {
  puzzleStreak: 'Puzzle Streak',
  easyGoal: 'Easy Goal',
  mediumGoal: 'Medium Goal',
  hardGoal: 'Hard Goal',
};

interface AggregatedDataPoint {
  label: string;
  date: string;
  uniqueUsers: number;
  totalAttempts: number;
  // Streak counts
  puzzleStreak3PlusCount: number;
  easyGoalStreak3PlusCount: number;
  mediumGoalStreak3PlusCount: number;
  hardGoalStreak3PlusCount: number;
}

const UsageStatsScreen: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30days');
  const [metricType, setMetricType] = useState<MetricType>('users');
  const [selectedStreakTypes, setSelectedStreakTypes] = useState<Set<StreakType>>(
    new Set<StreakType>(['puzzleStreak'])
  );
  const [statsData, setStatsData] = useState<UsageStatsEntry[]>([]);
  const [totalUniqueUsers, setTotalUniqueUsers] = useState<number>(0);
  const [totalAttempts, setTotalAttempts] = useState<number>(0);
  // Aggregate streak sums from the API
  const [streakSums, setStreakSums] = useState<{
    puzzleStreak3PlusSum: number;
    easyGoalStreak3PlusSum: number;
    mediumGoalStreak3PlusSum: number;
    hardGoalStreak3PlusSum: number;
  }>({
    puzzleStreak3PlusSum: 0,
    easyGoalStreak3PlusSum: 0,
    mediumGoalStreak3PlusSum: 0,
    hardGoalStreak3PlusSum: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate date range based on filter
  // NOTE: All data is collected 2 days behind by the scheduled collectDailyUsageStats function
  // This gives users in all timezones time to complete the puzzle before stats are finalized
  const DATA_DELAY_DAYS = 2;

  const getDateRange = (filter: TimeFilter): { startDate: string; endDate: string } => {
    const now = new Date();

    // Data collection has a 2-day delay for all metrics
    const endDateObj = new Date(now);
    endDateObj.setDate(now.getDate() - DATA_DELAY_DAYS);
    const endDate = endDateObj.toISOString().split('T')[0];

    let startDate: Date;
    switch (filter) {
      case '7days':
        startDate = new Date(endDateObj);
        startDate.setDate(endDateObj.getDate() - 6); // Last 7 days from end date
        break;
      case '30days':
        startDate = new Date(endDateObj);
        startDate.setDate(endDateObj.getDate() - 29); // Last 30 days from end date
        break;
      case '90days':
        startDate = new Date(endDateObj);
        startDate.setDate(endDateObj.getDate() - 89); // Last 90 days from end date
        break;
      case 'alltime':
        startDate = new Date('2024-01-01');
        break;
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate,
    };
  };

  // Helper to get the next cache invalidation time (12:30 AM ET)
  // Uses Intl.DateTimeFormat to properly handle DST (ET is UTC-5 standard, UTC-4 during DST)
  const getNextInvalidationTime = (): number => {
    const now = new Date();

    // Get current time components in America/New_York timezone (handles DST automatically)
    const etFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const etParts = etFormatter.formatToParts(now);
    const etYear = parseInt(etParts.find(p => p.type === 'year')?.value || '0');
    const etMonth = parseInt(etParts.find(p => p.type === 'month')?.value || '0') - 1;
    const etDay = parseInt(etParts.find(p => p.type === 'day')?.value || '0');
    const etHour = parseInt(etParts.find(p => p.type === 'hour')?.value || '0');
    const etMinute = parseInt(etParts.find(p => p.type === 'minute')?.value || '0');

    // Determine if we're past 12:30 AM ET today
    const isPastInvalidationTime = etHour > 0 || (etHour === 0 && etMinute >= 30);

    // Calculate target date (today or tomorrow in ET)
    let targetDay = etDay;
    let targetMonth = etMonth;
    let targetYear = etYear;

    if (isPastInvalidationTime) {
      // Move to next day
      const nextDay = new Date(Date.UTC(etYear, etMonth, etDay + 1));
      targetYear = nextDay.getUTCFullYear();
      targetMonth = nextDay.getUTCMonth();
      targetDay = nextDay.getUTCDate();
    }

    // Find what UTC time corresponds to 00:30 ET on the target day
    // Start with an estimate assuming -5 offset (standard time)
    let utcEstimate = new Date(Date.UTC(targetYear, targetMonth, targetDay, 5, 30));

    // Verify and adjust for DST: check what hour we get in ET
    const testParts = etFormatter.formatToParts(utcEstimate);
    const testHour = parseInt(testParts.find(p => p.type === 'hour')?.value || '0');

    // If we got 01:30 instead of 00:30, DST is active (offset is -4), adjust by -1 hour
    if (testHour === 1) {
      utcEstimate = new Date(utcEstimate.getTime() - 60 * 60 * 1000);
    }

    return utcEstimate.getTime();
  };

  // Check if cached data is still valid
  const isCacheValid = (cacheKey: string): boolean => {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return false;

    try {
      const { timestamp } = JSON.parse(cached);
      const nextInvalidation = getNextInvalidationTime();
      return Date.now() < nextInvalidation && timestamp < nextInvalidation;
    } catch {
      return false;
    }
  };

  // Fetch data when filter changes
  useEffect(() => {
    const fetchStats = async () => {
      const { startDate, endDate } = getDateRange(timeFilter);
      const cacheKey = `usageStats_${timeFilter}_${metricType}_${startDate}_${endDate}`;

      // Check cache first
      if (isCacheValid(cacheKey)) {
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey)!);
          setStatsData(cached.stats);
          setTotalUniqueUsers(cached.totalUniqueUsers || 0);
          setTotalAttempts(cached.totalAttempts || 0);
          setStreakSums({
            puzzleStreak3PlusSum: cached.puzzleStreak3PlusSum || 0,
            easyGoalStreak3PlusSum: cached.easyGoalStreak3PlusSum || 0,
            mediumGoalStreak3PlusSum: cached.mediumGoalStreak3PlusSum || 0,
            hardGoalStreak3PlusSum: cached.hardGoalStreak3PlusSum || 0,
          });
          setLoading(false);
          return;
        } catch {
          // Cache parse failed, continue to fetch
        }
      }

      setLoading(true);
      setError(null);

      try {
        const result = await getUsageStatsCallable({
          startDate,
          endDate,
          aggregateByMonth: timeFilter === 'alltime'
        });

        if (result.data.success && result.data.stats) {
          const stats = result.data.stats;
          const uniqueUsers = result.data.totalUniqueUsers || 0;
          const attempts = result.data.totalAttempts || 0;
          const streakSumsData = {
            puzzleStreak3PlusSum: result.data.puzzleStreak3PlusSum || 0,
            easyGoalStreak3PlusSum: result.data.easyGoalStreak3PlusSum || 0,
            mediumGoalStreak3PlusSum: result.data.mediumGoalStreak3PlusSum || 0,
            hardGoalStreak3PlusSum: result.data.hardGoalStreak3PlusSum || 0,
          };

          setStatsData(stats);
          setTotalUniqueUsers(uniqueUsers);
          setTotalAttempts(attempts);
          setStreakSums(streakSumsData);

          // Cache the result
          localStorage.setItem(cacheKey, JSON.stringify({
            stats,
            totalUniqueUsers: uniqueUsers,
            totalAttempts: attempts,
            ...streakSumsData,
            timestamp: Date.now(),
          }));
        } else {
          throw new Error(result.data.error || 'Failed to fetch usage stats');
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching usage statistics');
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchStats();
    }
  }, [timeFilter, metricType, isAuthenticated]);

  // Aggregate data - monthly for "all time", daily for others
  const aggregatedData: AggregatedDataPoint[] = useMemo(() => {
    if (statsData.length === 0) return [];

    if (timeFilter === 'alltime') {
      // Backend already aggregated by month, just format the labels
      return statsData.map(entry => {
        const monthKey = entry.puzzleId; // Already in YYYY-MM format from backend
        const [year, month] = monthKey.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short' });
        return {
          label: `${monthName} '${year.slice(2)}`,
          date: monthKey,
          uniqueUsers: entry.uniqueUsers, // Already deduplicated by backend
          totalAttempts: entry.totalAttempts,
          puzzleStreak3PlusCount: entry.puzzleStreak3PlusCount || 0,
          easyGoalStreak3PlusCount: entry.easyGoalStreak3PlusCount || 0,
          mediumGoalStreak3PlusCount: entry.mediumGoalStreak3PlusCount || 0,
          hardGoalStreak3PlusCount: entry.hardGoalStreak3PlusCount || 0,
        };
      });
    }

    // Daily data for other filters
    return statsData.map(entry => {
      // Parse as UTC to avoid timezone offset issues
      // entry.puzzleId is in YYYY-MM-DD format
      const [year, month, day] = entry.puzzleId.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return {
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        date: entry.puzzleId,
        uniqueUsers: entry.uniqueUsers,
        totalAttempts: entry.totalAttempts,
        puzzleStreak3PlusCount: entry.puzzleStreak3PlusCount || 0,
        easyGoalStreak3PlusCount: entry.easyGoalStreak3PlusCount || 0,
        mediumGoalStreak3PlusCount: entry.mediumGoalStreak3PlusCount || 0,
        hardGoalStreak3PlusCount: entry.hardGoalStreak3PlusCount || 0,
      };
    });
  }, [statsData, timeFilter]);

  // Calculate aggregate totals
  const totals = useMemo(() => {
    const dailyUsersSum = statsData.reduce((sum, d) => sum + d.uniqueUsers, 0);
    const avgUsersPerDay = statsData.length > 0 ? Math.round(dailyUsersSum / statsData.length) : 0;
    const avgAttemptsPerDay = statsData.length > 0 ? Math.round(totalAttempts / statsData.length) : 0;
    const peakDayUsers = statsData.length > 0
      ? statsData.reduce((max, d) => d.uniqueUsers > max.uniqueUsers ? d : max, statsData[0])
      : null;
    const peakDayAttempts = statsData.length > 0
      ? statsData.reduce((max, d) => d.totalAttempts > max.totalAttempts ? d : max, statsData[0])
      : null;

    return {
      totalUsers: totalUniqueUsers, // Use the actual unique users count from backend
      totalAttempts, // Use the total attempts from backend (from aggregate or sum of daily)
      avgUsersPerDay,
      avgAttemptsPerDay,
      peakDayUsers,
      peakDayAttempts,
      daysTracked: statsData.length
    };
  }, [statsData, totalUniqueUsers, totalAttempts]);

  const streakFields: Record<StreakType, keyof AggregatedDataPoint> = {
    puzzleStreak: 'puzzleStreak3PlusCount',
    easyGoal: 'easyGoalStreak3PlusCount',
    mediumGoal: 'mediumGoalStreak3PlusCount',
    hardGoal: 'hardGoalStreak3PlusCount',
  };

  const getChartValue = (point: AggregatedDataPoint): number => {
    if (metricType === 'users') return point.uniqueUsers;
    if (metricType === 'attempts') return point.totalAttempts;

    // Streaks mode - sum selected streak types
    return Array.from(selectedStreakTypes).reduce(
      (sum, type) => sum + (point[streakFields[type]] as number),
      0
    );
  };

  // Get individual streak values for a data point (used for multi-bar mode)
  const getStreakValues = (point: AggregatedDataPoint): Record<StreakType, number> => {
    return {
      puzzleStreak: point.puzzleStreak3PlusCount,
      easyGoal: point.easyGoalStreak3PlusCount,
      mediumGoal: point.mediumGoalStreak3PlusCount,
      hardGoal: point.hardGoalStreak3PlusCount,
    };
  };

  // Get the max individual streak value across all data points (for multi-bar height scaling)
  const getMaxStreakValue = (): number => {
    if (aggregatedData.length === 0) return 0;
    let max = 0;
    for (const point of aggregatedData) {
      for (const type of Array.from(selectedStreakTypes)) {
        const value = point[streakFields[type]] as number;
        if (value > max) max = value;
      }
    }
    return max;
  };

  // Toggle a streak type (ensure at least one is always selected)
  const toggleStreakType = (type: StreakType) => {
    setSelectedStreakTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        // Don't allow deselecting if it's the only one selected
        if (newSet.size > 1) {
          newSet.delete(type);
        }
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  // Handle metric type change
  const handleMetricTypeChange = (newType: MetricType) => {
    setMetricType(newType);
  };

  // Available time filters (all periods supported for all metric types)
  const availableTimeFilters: TimeFilter[] = ['7days', '30days', '90days', 'alltime'];

  const renderChart = () => {
    if (loading) {
      return (
        <div className="chart-placeholder">
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
          <p>Loading data...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="chart-placeholder error">
          <p>{error}</p>
        </div>
      );
    }

    if (aggregatedData.length === 0) {
      return (
        <div className="chart-placeholder">
          <p>No data available for this period.</p>
        </div>
      );
    }

    // Determine if we're in multi-bar mode
    const isMultiBarMode = metricType === 'streaks' && selectedStreakTypes.size > 1;
    const selectedStreakTypesArray = Array.from(selectedStreakTypes);

    // Use individual max for multi-bar mode, summed max for single bar mode
    const maxValue = isMultiBarMode
      ? getMaxStreakValue()
      : Math.max(...aggregatedData.map(getChartValue));
    const showEveryNth = aggregatedData.length > 15 ? Math.ceil(aggregatedData.length / 10) : 1;

    return (
      <div className="chart-area">
        {/* Legend for multi-bar mode */}
        {isMultiBarMode && (
          <div className="chart-legend">
            {selectedStreakTypesArray.map(type => (
              <div key={type} className="legend-item">
                <span
                  className="legend-color"
                  style={{ backgroundColor: STREAK_TYPE_COLORS[type] }}
                />
                <span className="legend-label">{STREAK_TYPE_LABELS[type]}</span>
              </div>
            ))}
          </div>
        )}
        <div className={`chart-bars ${isMultiBarMode ? 'multi-bar-mode' : ''}`}>
          {aggregatedData.map((point, index) => {
            const isLatest = index === aggregatedData.length - 1;
            const showLabel = index % showEveryNth === 0 || isLatest;

            if (isMultiBarMode) {
              // Multi-bar mode: render grouped bars
              const streakValues = getStreakValues(point);
              const totalValue = selectedStreakTypesArray.reduce(
                (sum, type) => sum + streakValues[type],
                0
              );

              return (
                <div key={point.date} className={`bar-column bar-column--grouped ${isLatest ? 'latest' : ''}`}>
                  <div className="bar-tooltip bar-tooltip--grouped">
                    <div className="tooltip-total">Total: {totalValue.toLocaleString()}</div>
                    {selectedStreakTypesArray.map(type => (
                      <div key={type} className="tooltip-row">
                        <span
                          className="tooltip-color"
                          style={{ backgroundColor: STREAK_TYPE_COLORS[type] }}
                        />
                        <span className="tooltip-label">{STREAK_TYPE_LABELS[type]}:</span>
                        <span className="tooltip-value">{streakValues[type].toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bar-track bar-track--grouped">
                    <div className="bar-group">
                      {selectedStreakTypesArray.map(type => {
                        const value = streakValues[type];
                        const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                        return (
                          <div
                            key={type}
                            className="bar-fill bar-fill--grouped"
                            style={{
                              height: `${Math.max(heightPercent, 3)}%`,
                              backgroundColor: STREAK_TYPE_COLORS[type],
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <span className={`bar-label ${showLabel ? '' : 'bar-label--hidden'}`}>{point.label}</span>
                </div>
              );
            } else {
              // Single bar mode (original behavior)
              const value = getChartValue(point);
              const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;

              return (
                <div key={point.date} className={`bar-column ${isLatest ? 'latest' : ''}`}>
                  <div className="bar-tooltip">{value.toLocaleString()}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ height: `${Math.max(heightPercent, 3)}%` }} />
                  </div>
                  <span className={`bar-label ${showLabel ? '' : 'bar-label--hidden'}`}>{point.label}</span>
                </div>
              );
            }
          })}
        </div>
      </div>
    );
  };

  const timeFilterLabels: Record<TimeFilter, string> = {
    '7days': '7D',
    '30days': '30D',
    '90days': '90D',
    'alltime': 'All',
  };

  return (
    <div className="usage-stats-screen">
      {/* Header */}
      <header className="screen-header">
        <h1>Analytics</h1>
      </header>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card featured">
          <div className="card-icon">
            <FontAwesomeIcon icon={faUsers} />
          </div>
          <div className="card-data">
            <span className="card-value">{totals.totalUsers.toLocaleString()}</span>
            <span className="card-label">Total Players</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">
            <FontAwesomeIcon icon={faGamepad} />
          </div>
          <div className="card-data">
            <span className="card-value">{totals.totalAttempts.toLocaleString()}</span>
            <span className="card-label">Total Attempts</span>
          </div>
        </div>
      </div>

      {/* Chart Panel */}
      <div className="chart-panel">
        {/* Controls Row */}
        <div className="chart-controls">
          <div className="time-toggles">
            {availableTimeFilters.map(key => (
              <button
                key={key}
                className={timeFilter === key ? 'active' : ''}
                onClick={() => setTimeFilter(key)}
              >
                {timeFilterLabels[key]}
              </button>
            ))}
          </div>
          <div className="metric-toggles">
            <button
              className={metricType === 'users' ? 'active' : ''}
              onClick={() => handleMetricTypeChange('users')}
            >
              <FontAwesomeIcon icon={faUsers} />
              <span>Users</span>
            </button>
            <button
              className={metricType === 'attempts' ? 'active' : ''}
              onClick={() => handleMetricTypeChange('attempts')}
            >
              <FontAwesomeIcon icon={faGamepad} />
              <span>Attempts</span>
            </button>
            <button
              className={metricType === 'streaks' ? 'active' : ''}
              onClick={() => handleMetricTypeChange('streaks')}
            >
              <FontAwesomeIcon icon={faFire} />
              <span>Streaks</span>
            </button>
          </div>
        </div>

        {/* Streak Type Selector (shown when streaks mode is active) */}
        {metricType === 'streaks' && (
          <div className="streak-type-selector">
            {(['puzzleStreak', 'easyGoal', 'mediumGoal', 'hardGoal'] as StreakType[]).map(type => (
              <label
                key={type}
                className={selectedStreakTypes.has(type) ? 'active' : ''}
                data-streak-type={type}
              >
                <input
                  type="checkbox"
                  checked={selectedStreakTypes.has(type)}
                  onChange={() => toggleStreakType(type)}
                />
                <span>{STREAK_TYPE_LABELS[type]}</span>
              </label>
            ))}
          </div>
        )}

        {/* Chart Title */}
        <div className="chart-title">
          <h2>
            {timeFilter === 'alltime' ? 'Monthly' : 'Daily'}{' '}
            {metricType === 'users' ? 'Active Users' :
             metricType === 'attempts' ? 'Puzzle Attempts' :
             'Users with 3+ Day Streaks'}
          </h2>
          <span className="chart-subtitle">
            {timeFilter === 'alltime'
              ? `${aggregatedData.length} months`
              : `${totals.daysTracked} days`}
            {' (data 2 days behind)'}
          </span>
        </div>

        {/* Chart */}
        {renderChart()}
      </div>

      {/* Footer Stats */}
      <div className="footer-stats">
        {metricType !== 'streaks' ? (
          <>
            <div className="footer-stat">
              <span className="footer-value">
                {metricType === 'users'
                  ? totals.avgUsersPerDay.toLocaleString()
                  : totals.avgAttemptsPerDay.toLocaleString()}
              </span>
              <span className="footer-label">
                {metricType === 'users' ? 'Avg Daily Users' : 'Avg Daily Attempts'}
              </span>
            </div>
            {(metricType === 'users' ? totals.peakDayUsers : totals.peakDayAttempts) && (
              <div className="footer-stat">
                <span className="footer-value">
                  {metricType === 'users'
                    ? totals.peakDayUsers?.uniqueUsers.toLocaleString()
                    : totals.peakDayAttempts?.totalAttempts.toLocaleString()}
                </span>
                <span className="footer-label">
                  {metricType === 'users' ? 'Peak Day Users' : 'Peak Day Attempts'}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="footer-stat">
              <span className="footer-value">
                {(() => {
                  // Calculate total streak sum from the selected streak types
                  let totalSum = 0;
                  if (selectedStreakTypes.has('puzzleStreak')) totalSum += streakSums.puzzleStreak3PlusSum;
                  if (selectedStreakTypes.has('easyGoal')) totalSum += streakSums.easyGoalStreak3PlusSum;
                  if (selectedStreakTypes.has('mediumGoal')) totalSum += streakSums.mediumGoalStreak3PlusSum;
                  if (selectedStreakTypes.has('hardGoal')) totalSum += streakSums.hardGoalStreak3PlusSum;
                  return totalSum.toLocaleString();
                })()}
              </span>
              <span className="footer-label">Total Streak Users</span>
            </div>
            {aggregatedData.length > 0 && (
              <div className="footer-stat">
                <span className="footer-value">
                  {(() => {
                    // Calculate average from total sum / number of days
                    let totalSum = 0;
                    if (selectedStreakTypes.has('puzzleStreak')) totalSum += streakSums.puzzleStreak3PlusSum;
                    if (selectedStreakTypes.has('easyGoal')) totalSum += streakSums.easyGoalStreak3PlusSum;
                    if (selectedStreakTypes.has('mediumGoal')) totalSum += streakSums.mediumGoalStreak3PlusSum;
                    if (selectedStreakTypes.has('hardGoal')) totalSum += streakSums.hardGoalStreak3PlusSum;
                    return Math.round(totalSum / aggregatedData.length).toLocaleString();
                  })()}
                </span>
                <span className="footer-label">Avg Daily Streak Users</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UsageStatsScreen;
