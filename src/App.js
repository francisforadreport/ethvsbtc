import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import axios from 'axios';
import './App.css';
import { Line, Bar } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Add utility functions at the top
const axiosWithRetry = async (url, options = {}, retries = 3, delay = 1000) => {
  try {
    return await axios({
      url,
      timeout: 5000, // 5 second timeout
      ...options
    });
  } catch (error) {
    if (retries === 0) throw error;
    
    // Handle specific error types
    if (error.response?.status === 429) { // Rate limit
      delay = delay * 2; // Exponential backoff
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return axiosWithRetry(url, options, retries - 1, delay);
  }
};

// Add this new component before the App component
const ETFFlowsSection = ({ etfData, isLoading, dataFreshness }) => {
  const [viewMode, setViewMode] = useState('chart');
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [etfHistoricalData, setEtfHistoricalData] = useState({
    bitcoin: [],
    ethereum: []
  });

  // Generate mock historical data - use provided data if available
  useEffect(() => {
    // If we have data from the parent component, use it
    if (etfData) {
      setEtfHistoricalData(etfData);
      return;
    }

    // Otherwise, generate mock data as before
    const generateMockData = (timeRange) => {
      const dataPoints = {
        '24h': 24,
        '7d': 7,
        '1m': 30,
        'all': 90
      }[timeRange];

      const now = new Date();
      const data = [];

      for (let i = dataPoints; i >= 0; i--) {
        const date = new Date(now);
        date.setHours(now.getHours() - i);
        
        data.push({
          date,
          inflow: Math.random() * 500000000,
          outflow: Math.random() * 300000000,
          netFlow: 0, // Will be calculated
          price: Math.random() * 1000 + 40000
        });
      }

      // Calculate net flow and add some trend
      data.forEach(point => {
        point.netFlow = point.inflow - point.outflow;
      });

      return data;
    };

    const btcData = generateMockData(selectedTimeRange);
    const ethData = generateMockData(selectedTimeRange);

    setEtfHistoricalData({
      bitcoin: btcData,
      ethereum: ethData
    });
  }, [selectedTimeRange, etfData]);

  const formatCurrency = (value) => {
    if (Math.abs(value) >= 1e9) {
      return `$${(value / 1e9).toFixed(2)}B`;
    }
    return `$${(value / 1e6).toFixed(2)}M`;
  };

  const ETFFlowChart = () => {
    const formatDate = (date) => {
      if (selectedTimeRange === '24h') {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (selectedTimeRange === '7d') {
        return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
      }
      if (selectedTimeRange === '1m') {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      return date.toLocaleDateString([], { year: '2-digit', month: 'numeric' });
    };

    // Early return if data is not available
    if (!etfHistoricalData.bitcoin || etfHistoricalData.bitcoin.length === 0 ||
        !etfHistoricalData.ethereum || etfHistoricalData.ethereum.length === 0) {
      return <div className="empty-chart">No ETF flow data available</div>;
    }

    return (
      <div className="etf-flow-chart">
        <Line
          data={{
            labels: etfHistoricalData.bitcoin.map(item => formatDate(item.date)),
            datasets: [
              {
                label: 'BTC ETF Flow',
                data: etfHistoricalData.bitcoin.map(item => item.netFlow / 1e6),
                borderColor: '#f1c40f',
                backgroundColor: (context) => {
                  const chart = context.chart;
                  const { ctx, chartArea } = chart;
                  if (!chartArea) return null;
                  
                  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                  gradient.addColorStop(0, 'rgba(241, 196, 15, 0.4)');  // Yellow for inflow
                  gradient.addColorStop(0.5, 'rgba(241, 196, 15, 0.1)');
                  gradient.addColorStop(0.5, 'rgba(231, 76, 60, 0.1)');  // Red for outflow
                  gradient.addColorStop(1, 'rgba(231, 76, 60, 0.4)');
                  return gradient;
                },
                fill: true,
                tension: 0.4,
                segment: {
                  borderColor: (context) => {
                    if (context.p1.parsed.y < 0) {
                      return '#e74c3c';  // Red for negative values
                    }
                    return '#f1c40f';  // Yellow for positive values
                  }
                }
              },
              {
                label: 'ETH ETF Flow',
                data: etfHistoricalData.ethereum.map(item => item.netFlow / 1e6),
                borderColor: '#2ecc71',
                backgroundColor: (context) => {
                  const chart = context.chart;
                  const { ctx, chartArea } = chart;
                  if (!chartArea) return null;
                  
                  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                  gradient.addColorStop(0, 'rgba(46, 204, 113, 0.4)');  // Green for inflow
                  gradient.addColorStop(0.5, 'rgba(46, 204, 113, 0.1)');
                  gradient.addColorStop(0.5, 'rgba(231, 76, 60, 0.1)');  // Red for outflow
                  gradient.addColorStop(1, 'rgba(231, 76, 60, 0.4)');
                  return gradient;
                },
                fill: true,
                tension: 0.4,
                segment: {
                  borderColor: (context) => {
                    if (context.p1.parsed.y < 0) {
                      return '#e74c3c';  // Red for negative values
                    }
                    return '#2ecc71';  // Green for positive values
                  }
                }
              }
            ]
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Disable animations to prevent flickering
            interaction: {
              mode: 'index',
              intersect: false,
            },
            plugins: {
              legend: {
                position: 'top',
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const value = context.raw;
                    const flowType = value >= 0 ? 'Inflow' : 'Outflow';
                    const coin = context.dataset.label.split(' ')[0];
                    return `${coin} ${flowType}: ${formatCurrency(Math.abs(value * 1e6))}`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: {
                  display: false
                }
              },
              y: {
                grid: {
                  color: (context) => {
                    if (context.tick.value === 0) {
                      return 'rgba(0, 0, 0, 0.2)';  // Darker line for zero
                    }
                    return 'rgba(0, 0, 0, 0.05)';
                  },
                  lineWidth: (context) => {
                    if (context.tick.value === 0) {
                      return 2;  // Thicker line for zero
                    }
                    return 1;
                  }
                },
                ticks: {
                  callback: (value) => {
                    const prefix = value >= 0 ? '+' : '-';
                    return `${prefix}${formatCurrency(Math.abs(value * 1e6))}`;
                  }
                }
              }
            }
          }}
        />
      </div>
    );
  };

  const ETFFlowTable = () => {
    const getLatestData = (data) => {
      if (!data || data.length === 0) return { inflow: 0, outflow: 0, netFlow: 0 };
      return data[data.length - 1];
    };

    const calculateChange = (data) => {
      if (!data || data.length < 2) return 0;
      const latest = data[data.length - 1].netFlow;
      const previous = data[0].netFlow;
      // Avoid division by zero
      if (previous === 0) return latest > 0 ? 100 : latest < 0 ? -100 : 0;
      return ((latest - previous) / Math.abs(previous)) * 100;
    };

    const btcLatest = getLatestData(etfHistoricalData.bitcoin);
    const ethLatest = getLatestData(etfHistoricalData.ethereum);
    const btcChange = calculateChange(etfHistoricalData.bitcoin);
    const ethChange = calculateChange(etfHistoricalData.ethereum);

    return (
      <div className="etf-flow-table">
        <table>
          <thead>
            <tr>
              <th>ETF</th>
              <th>Inflow</th>
              <th>Outflow</th>
              <th>Net Flow</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="etf-name">
                  <img src="https://assets.coingecko.com/coins/images/1/small/bitcoin.png" alt="BTC" />
                  <span>Bitcoin ETFs</span>
                </div>
              </td>
              <td>{formatCurrency(btcLatest.inflow)}</td>
              <td>{formatCurrency(btcLatest.outflow)}</td>
              <td className={btcLatest.netFlow >= 0 ? 'positive' : 'negative'}>
                {formatCurrency(btcLatest.netFlow)}
              </td>
              <td className={btcChange >= 0 ? 'positive' : 'negative'}>
                {btcChange.toFixed(2)}%
              </td>
            </tr>
            <tr>
              <td>
                <div className="etf-name">
                  <img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png" alt="ETH" />
                  <span>Ethereum ETFs</span>
                </div>
              </td>
              <td>{formatCurrency(ethLatest.inflow)}</td>
              <td>{formatCurrency(ethLatest.outflow)}</td>
              <td className={ethLatest.netFlow >= 0 ? 'positive' : 'negative'}>
                {formatCurrency(ethLatest.netFlow)}
              </td>
              <td className={ethChange >= 0 ? 'positive' : 'negative'}>
                {ethChange.toFixed(2)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="etf-flows-section">
      <div className="section-header">
        <h2>ETF Inflows/Outflows</h2>
        <div className="view-controls">
          <div className="tab-buttons">
            <button 
              className={`tab-button ${viewMode === 'chart' ? 'active' : ''}`}
              onClick={() => setViewMode('chart')}
            >
              Chart
            </button>
            <button 
              className={`tab-button ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
          </div>
          <div className="time-range-selector">
            {['24h', '7d', '1m', 'all'].map(range => (
              <button
                key={range}
                className={`range-button ${selectedTimeRange === range ? 'active' : ''}`}
                onClick={() => setSelectedTimeRange(range)}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        {dataFreshness && <DataFreshness timestamp={dataFreshness} />}
      </div>
      <div className={`etf-flows-content ${isLoading ? 'loading-section' : ''}`}>
        {isLoading && <LoadingOverlay />}
        {viewMode === 'chart' ? <ETFFlowChart /> : <ETFFlowTable />}
      </div>
    </div>
  );
};

// Move component definitions outside of the App component to prevent recreation on each render
// Memoize the DataFreshness component
const DataFreshness = memo(({ timestamp }) => (
  <div className="data-freshness">
    Last updated: {timestamp || 'Never'}
  </div>
));

// Memoize the LoadingOverlay component
const LoadingOverlay = memo(() => (
  <div className="loading-overlay">
    <div className="loading-spinner"></div>
  </div>
));

// Memoize the TimeRangeSelector component
const TimeRangeSelector = memo(({ activeRange, onRangeChange }) => (
  <div className="time-range-selector">
    {['24h', '7d', '1m', 'all'].map(range => (
      <button
        key={range}
        className={`range-button ${activeRange === range ? 'active' : ''}`}
        onClick={() => onRangeChange(range)}
      >
        {range}
      </button>
    ))}
  </div>
));

// Memoize the CryptoChart component with proper dependencies
// const CryptoChart = memo(({ data, options, ...props }) => {
//   ... component code
// });

// Memoize the CombinedCryptoChart component with proper dependencies
const CombinedCryptoChart = memo(({ btcData, ethData, timeRange }) => {
  // Always declare hooks at the top level, before any conditional logic
  const chartRef = useRef(null);

  const calculateRelativeChanges = useCallback((prices) => {
    if (!prices || prices.length === 0) return [];
    const initialPrice = prices[0];
    return prices.map(price => ((price - initialPrice) / initialPrice) * 100);
  }, []);

  const formatDate = useCallback((date) => {
    if (!date) return '';
    if (timeRange === '24h') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (timeRange === '7d') {
      return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
    }
    if (timeRange === '1m') {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    if (timeRange === 'all') {
      return date.toLocaleDateString([], { 
        year: '2-digit',
        month: 'numeric'
      });
    }
    return date.toLocaleDateString();
  }, [timeRange]);

  // Safe data access with default values
  const btcPrices = useMemo(() => {
    if (!btcData || btcData.length === 0) return [];
    return btcData.map(item => item.price);
  }, [btcData]);
  
  const ethPrices = useMemo(() => {
    if (!ethData || ethData.length === 0) return [];
    return ethData.map(item => item.price);
  }, [ethData]);
  
  const btcChanges = useMemo(() => 
    calculateRelativeChanges(btcPrices), 
  [calculateRelativeChanges, btcPrices]);
  
  const ethChanges = useMemo(() => 
    calculateRelativeChanges(ethPrices), 
  [calculateRelativeChanges, ethPrices]);

  // Calculate y-axis range with padding
  const { minValue, maxValue, range, padding } = useMemo(() => {
    const allChanges = [...btcChanges, ...ethChanges];
    if (allChanges.length === 0) {
      return { minValue: 0, maxValue: 0, range: 0, padding: 0 };
    }
    const min = Math.floor(Math.min(...allChanges));
    const max = Math.ceil(Math.max(...allChanges));
    const r = max - min;
    const p = r * 0.1;
    return { minValue: min, maxValue: max, range: r, padding: p };
  }, [btcChanges, ethChanges]);

  // Memoize chart data to prevent unnecessary recalculations
  const chartData = useMemo(() => {
    if (!btcData || !ethData || btcData.length === 0 || ethData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }
    
    return {
      labels: btcData.map(item => formatDate(item.time)),
      datasets: [
        {
          label: 'BTC',
          data: btcChanges,
          borderColor: '#f1c40f',
          backgroundColor: '#f1c40f',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2,
          realData: btcPrices
        },
        {
          label: 'ETH',
          data: ethChanges,
          borderColor: '#2ecc71',
          backgroundColor: '#2ecc71',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2,
          realData: ethPrices
        }
      ]
    };
  }, [btcData, ethData, formatDate, btcChanges, ethChanges, btcPrices, ethPrices]);
  
  // Memoize chart options to prevent unnecessary recalculations
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // Disable animations to prevent flickering
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        padding: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderColor: '#ddd',
        borderWidth: 1,
        titleColor: '#666',
        bodyColor: '#666',
        titleFont: {
          size: 12,
          weight: 'normal'
        },
        bodyFont: {
          size: 12
        },
        callbacks: {
          label: (context) => {
            const price = context.dataset.realData?.[context.dataIndex] || 0;
            const change = context.raw.toFixed(2);
            return `${context.dataset.label}: $${price.toLocaleString()} (${change}%)`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
          drawBorder: false
        },
        ticks: {
          maxRotation: 0,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: 6,
          padding: 8,
          font: {
            size: 11
          },
          color: '#666'
        }
      },
      y: {
        position: 'right',
        min: minValue - padding,
        max: maxValue + padding,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        },
        ticks: {
          padding: 8,
          stepSize: Math.ceil(range || 1) / 4,
          callback: value => `${value.toFixed(1)}%`,
          font: {
            size: 11
          },
          color: '#666'
        }
      }
    }
  }), [minValue, maxValue, range, padding]);

  // Early return after hooks
  if (!btcData || !ethData || btcData.length === 0 || ethData.length === 0) {
    return <div className="chart-wrapper empty-chart">No data available</div>;
  }

  return (
    <div className="chart-wrapper">
      <Line
        ref={chartRef}
        data={chartData}
        options={chartOptions}
        redraw={false}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Similar custom comparison as CryptoChart
  if (prevProps.timeRange !== nextProps.timeRange) return false;
  return true; // Only re-render on timeRange change
});

function App() {
  const [cryptoData, setCryptoData] = useState(null);
  const [loading, setLoading] = useState({
    prices: true,
    pressure: true,
    reserves: true,
    etf: true
  });
  const [marketPressure, setMarketPressure] = useState(null);
  const [exchangeReserves, setExchangeReserves] = useState(null);
  const [priceRatio, setPriceRatio] = useState([]);
  const [error, setError] = useState(null);
  const [dataFreshness, setDataFreshness] = useState({});
  const [timeRange, setTimeRange] = useState('24h');
  const [historicalData, setHistoricalData] = useState({
    bitcoin: [],
    ethereum: []
  });
  const [etfData, setEtfData] = useState(null);
  const [etfLoading, setEtfLoading] = useState(false);
  const [newsData, setNewsData] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);

  // Use useRef for data that shouldn't trigger re-renders
  const dataCache = useRef({
    historicalBtc: [],
    historicalEth: []
  });

    // Function to fetch basic crypto data from Binance
  const fetchCryptoData = useCallback(async () => {
      try {
      setLoading(prev => ({ ...prev, prices: true }));
        const [btcResponse, ethResponse] = await Promise.all([
          axiosWithRetry('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'),
          axiosWithRetry('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT')
        ]);

        // Update data freshness
        setDataFreshness(prev => ({
          ...prev,
          prices: new Date().toLocaleTimeString()
        }));

        // Transform the data to match our expected format
        const transformedData = [
          {
            id: 'bitcoin',
            name: 'Bitcoin',
            symbol: 'BTC',
            current_price: parseFloat(btcResponse.data.lastPrice),
            price_change_percentage_24h: parseFloat(btcResponse.data.priceChangePercent),
            market_cap: parseFloat(btcResponse.data.quoteVolume),
            market_cap_change_percentage_24h: parseFloat(btcResponse.data.priceChangePercent),
            image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png'
          },
          {
            id: 'ethereum',
            name: 'Ethereum',
            symbol: 'ETH',
            current_price: parseFloat(ethResponse.data.lastPrice),
            price_change_percentage_24h: parseFloat(ethResponse.data.priceChangePercent),
            market_cap: parseFloat(ethResponse.data.quoteVolume),
            market_cap_change_percentage_24h: parseFloat(ethResponse.data.priceChangePercent),
            image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
          }
        ];

        setCryptoData(transformedData);
        
      // Calculate ETH/BTC ratio (not BTC/ETH)
        const btcPrice = parseFloat(btcResponse.data.lastPrice);
        const ethPrice = parseFloat(ethResponse.data.lastPrice);
      const ratio = ethPrice / btcPrice; // ETH/BTC ratio
      
      // Store timestamp for better x-axis display
      const timestamp = new Date();
      
        setPriceRatio(prev => {
        const newData = [...prev, { 
          date: timestamp.toLocaleTimeString(), 
          ratio,
          timestamp,
          btcPrice,
          ethPrice
        }];
        return newData.slice(-288); // Keep last 24 hours (288 = 24h * 12 updates per hour)
      });

      setError(null);
      } catch (err) {
        setError(`Failed to fetch crypto data: ${err.message}`);
        console.error('Binance API Error:', err);
    } finally {
      setLoading(prev => ({ ...prev, prices: false }));
      }
  }, [setLoading, setDataFreshness, setError, setPriceRatio, setCryptoData]);

  // Function to fetch market pressure data
  const fetchMarketPressure = useCallback(async () => {
      try {
      setLoading(prev => ({ ...prev, pressure: true }));
      
      // Fetch current order book data
        const [btcBook, ethBook] = await Promise.all([
        axiosWithRetry('https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=100'),
        axiosWithRetry('https://api.binance.com/api/v3/depth?symbol=ETHUSDT&limit=100')
        ]);

        setDataFreshness(prev => ({
          ...prev,
          pressure: new Date().toLocaleTimeString()
        }));

      // Simplified pressure calculation
        const calculatePressure = (bookData) => {
        // Calculate total buy and sell volumes from order book
        const buyVolume = bookData.bids.reduce((acc, [price, qty]) => 
          acc + (parseFloat(price) * parseFloat(qty)), 0);
        const sellVolume = bookData.asks.reduce((acc, [price, qty]) => 
          acc + (parseFloat(price) * parseFloat(qty)), 0);
        
        // Simple buy/sell ratio converted to percentage
        const totalVolume = buyVolume + sellVolume;
        const buyPercentage = (buyVolume / totalVolume) * 100;
        
        return {
          pressure: buyPercentage - 50, // Center around 0 (-50 to +50)
          buyStrength: buyPercentage,
          sellStrength: 100 - buyPercentage,
          totalVolume
        };
      };

      // Generate time series data
      const generateTimeSeriesData = (currentPressure, symbol) => {
        const now = Date.now();
        const data = {};
        
        // Simplified timeframes
        const timeframes = {
          '5m': { points: 30, interval: 5 * 60 * 1000 },  // 30 points for 5 minutes
          '30m': { points: 30, interval: 30 * 60 * 1000 }, // 30 points for 30 minutes
          '1h': { points: 30, interval: 60 * 60 * 1000 }   // 30 points for 1 hour
        };

        Object.entries(timeframes).forEach(([timeframe, { points, interval }]) => {
          const timeframeData = Array.from({ length: points }, (_, i) => {
            const time = new Date(now - (i * interval));
            // Smoother randomization
            const randomFactor = 0.9 + Math.random() * 0.2;
            const baseValue = currentPressure.pressure * randomFactor;
            
            return {
              time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              pressure: baseValue,
              buyStrength: currentPressure.buyStrength * randomFactor,
              sellStrength: currentPressure.sellStrength * randomFactor,
              totalVolume: currentPressure.totalVolume / points
            };
          }).reverse();

          // Simple moving average calculation
          const calculateMA = (data, period) => {
            return data.map((_, index) => {
              if (index < period - 1) return null;
              const slice = data.slice(index - period + 1, index + 1);
              return slice.reduce((sum, item) => sum + item.pressure, 0) / period;
            });
          };

          // Calculate only MA10 for simplicity
          const MA10 = calculateMA(timeframeData, 10);
          timeframeData.forEach((item, i) => {
            item.MA10 = MA10[i];
          });

          data[timeframe] = timeframeData;
        });

        return data;
        };

        const btcPressure = calculatePressure(btcBook.data);
        const ethPressure = calculatePressure(ethBook.data);

        setMarketPressure({
          bitcoin: {
          current: btcPressure,
          timeframes: generateTimeSeriesData(btcPressure, 'BTC')
          },
          ethereum: {
          current: ethPressure,
          timeframes: generateTimeSeriesData(ethPressure, 'ETH')
          }
        });

      } catch (err) {
        console.error('Failed to fetch market pressure:', err);
    } finally {
      setLoading(prev => ({ ...prev, pressure: false }));
    }
  }, [setLoading, setDataFreshness, setMarketPressure]);

  // Function to fetch exchange reserves using CoinGecko's simple endpoint
  const fetchExchangeReserves = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, reserves: true }));
      
      // Use CoinGecko's simple coins endpoint
      const [btcData, ethData] = await Promise.all([
        axiosWithRetry('https://api.coingecko.com/api/v3/coins/bitcoin'),
        axiosWithRetry('https://api.coingecko.com/api/v3/coins/ethereum')
      ]);

      // Extract 24h trading volume and estimate reserves
      const btcVolume = btcData.data.market_data.total_volume.usd;
      const ethVolume = ethData.data.market_data.total_volume.usd;
      
      // Get current prices
      const btcPrice = btcData.data.market_data.current_price.usd;
      const ethPrice = ethData.data.market_data.current_price.usd;

      // Calculate reserves in respective cryptocurrencies
      // Using 20% of 24h volume as a conservative estimate
      const btcReserves = (btcVolume * 0.20) / btcPrice;
      const ethReserves = (ethVolume * 0.20) / ethPrice;

        setExchangeReserves({
        bitcoin: btcReserves,
        ethereum: ethReserves
      });

      setDataFreshness(prev => ({
        ...prev,
        reserves: new Date().toLocaleTimeString()
      }));

      setError(null);
      } catch (err) {
      console.error('Failed to fetch exchange reserves:', err);
      // Use alternative endpoint if the first one fails
      try {
        const [btcMarketData, ethMarketData] = await Promise.all([
          axiosWithRetry('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currency=usd&include_24hr_vol=true'),
          axiosWithRetry('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currency=usd&include_24hr_vol=true')
        ]);

        const btcVolume = btcMarketData.data.bitcoin.usd_24h_vol;
        const ethVolume = ethMarketData.data.ethereum.usd_24h_vol;
        const btcPrice = btcMarketData.data.bitcoin.usd;
        const ethPrice = ethMarketData.data.ethereum.usd;

        setExchangeReserves({
          bitcoin: (btcVolume * 0.20) / btcPrice,
          ethereum: (ethVolume * 0.20) / ethPrice
        });

        setDataFreshness(prev => ({
          ...prev,
          reserves: new Date().toLocaleTimeString()
        }));
      } catch (fallbackErr) {
        console.error('Failed to fetch fallback exchange data:', fallbackErr);
        // Use static fallback values if both attempts fail
        setExchangeReserves({
          bitcoin: 10000,
          ethereum: 100000
        });
      }
    } finally {
      setLoading(prev => ({ ...prev, reserves: false }));
    }
  }, [setLoading, setDataFreshness, setExchangeReserves, setError]);

  // Function to generate mock ETF data with more realistic patterns
  const generateMockEtfData = (timeRange) => {
    const dataPoints = {
      '24h': 24,
      '7d': 7,
      '1m': 30,
      'all': 90
    }[timeRange] || 24;

    const now = new Date();
    const data = [];
    
    // Create a base trend that's somewhat realistic
    const trendDirection = Math.random() > 0.5 ? 1 : -1; // Random trend direction
    const trendStrength = Math.random() * 0.2 + 0.1; // Random trend strength
    
    for (let i = dataPoints; i >= 0; i--) {
      const date = new Date(now);
      date.setHours(now.getHours() - i);
      
      // Create some cyclical patterns
      const timeOfDay = date.getHours();
      const dayFactor = (timeOfDay > 9 && timeOfDay < 16) ? 1.2 : 0.8; // More activity during business hours
      
      // Add some randomness but maintain the trend
      const trendFactor = 1 + (trendDirection * trendStrength * (dataPoints - i) / dataPoints);
      const randomFactor = 0.7 + Math.random() * 0.6;
      
      // Base values with some randomness
      const baseInflow = 300000000 * randomFactor * dayFactor * trendFactor;
      const baseOutflow = 250000000 * randomFactor * dayFactor;
      
      data.push({
        date,
        inflow: baseInflow,
        outflow: baseOutflow,
        netFlow: baseInflow - baseOutflow,
        price: 40000 + (Math.random() * 5000 * trendFactor)
      });
    }

    return data;
    };

    // Function to fetch ETF flows - using mock data as Binance doesn't provide ETF data
  const fetchEtfFlows = useCallback(async () => {
    try {
      setEtfLoading(true);
      
      // Generate different data for BTC and ETH
      const btcData = generateMockEtfData(timeRange);
      const ethData = generateMockEtfData(timeRange);
      
      // Store both datasets
      setEtfData({
        bitcoin: btcData,
        ethereum: ethData
      });
      
      setEtfLoading(false);
      setDataFreshness(prev => ({
        ...prev,
        etf: new Date().toLocaleTimeString()
      }));
      
      return { bitcoin: btcData, ethereum: ethData };
    } catch (error) {
      console.error('Error fetching ETF flows:', error);
      setEtfLoading(false);
      return null;
    }
  }, [timeRange]); // Add timeRange as dependency

  // Function to get Binance interval and limit based on timeRange
  const getTimeRangeParams = (range, symbol) => {
    switch(range) {
      case '24h':
        return { 
          interval: '5m', 
          limit: 288,  // 5min * 288 = 24h
          startTime: Date.now() - (24 * 60 * 60 * 1000) // 24 hours ago
        };
      case '7d':
        return { 
          interval: '1h', 
          limit: 168,  // 1h * 168 = 7d
          startTime: Date.now() - (7 * 24 * 60 * 60 * 1000) // 7 days ago
        };
      case '1m':
        return { 
          interval: '4h', 
          limit: 180,  // 4h * 180 = 30d
          startTime: Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days ago
        };
      case 'all':
        // For 'all' time range, use different start times for BTC and ETH
        const startTime = symbol === 'BTC' 
          ? new Date('2009-01-03').getTime()  // Bitcoin genesis block date
          : new Date('2015-07-30').getTime(); // Ethereum launch date
        return { 
          interval: '1w',  // Weekly intervals for long-term data
          startTime: startTime,
          endTime: Date.now()
        };
      default:
        return { 
          interval: '5m', 
          limit: 288,
          startTime: Date.now() - (24 * 60 * 60 * 1000)
        };
    }
  };

  // Function to fetch historical data - memoized to maintain reference
  const fetchHistoricalData = useCallback(async (symbol, range) => {
    try {
      const params = getTimeRangeParams(range, symbol);
      let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${params.interval}`;
      
      // Add parameters based on range
      if (range === 'all') {
        url += `&startTime=${params.startTime}&endTime=${params.endTime}`;
      } else {
        url += `&limit=${params.limit}`;
        if (params.startTime) {
          url += `&startTime=${params.startTime}`;
        }
      }

      const response = await axiosWithRetry(url);

      // Transform the data
      const transformedData = response.data.map(candle => ({
        time: new Date(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        price: parseFloat(candle[4]), // closing price
        volume: parseFloat(candle[5])
      }));

      // For very long time ranges, reduce data points to improve performance
      if (range === 'all' && transformedData.length > 500) {
        const step = Math.floor(transformedData.length / 500);
        return transformedData.filter((_, index) => index % step === 0);
      }

      return transformedData;
    } catch (err) {
      console.error(`Failed to fetch historical data for ${symbol}:`, err);
      return [];
    }
  }, []);

  // Use useCallback for functions that are passed as props
  const handleTimeRangeChange = useCallback(async (range) => {
    setTimeRange(range);
    setLoading(prev => ({ ...prev, historical: true }));
    
    try {
      const [btcHistory, ethHistory] = await Promise.all([
        fetchHistoricalData('BTC', range),
        fetchHistoricalData('ETH', range)
      ]);

      // Update the cache first
      dataCache.current = {
        ...dataCache.current,
        historicalBtc: btcHistory,
        historicalEth: ethHistory
      };

      // Then update state (triggers render)
      setHistoricalData({
        bitcoin: btcHistory,
        ethereum: ethHistory
      });
    } catch (err) {
      console.error('Failed to fetch historical data:', err);
    } finally {
      setLoading(prev => ({ ...prev, historical: false }));
    }
  }, [fetchHistoricalData]);

  // Add historical data fetch to initial load
  useEffect(() => {
    handleTimeRangeChange('24h');
  }, [handleTimeRangeChange]); // Add handleTimeRangeChange as a dependency

  // Update the fetchCryptoNews function to properly handle dependencies
  const fetchCryptoNews = useCallback(async () => {
    const API_KEY = '8830ad7e5785fd64639a28710b4a2eb6b8fac83f9457cee059aff40c0311ad41';
    
    try {
      setNewsLoading(true);
      const response = await axiosWithRetry(
        `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,ETH&excludeCategories=Sponsored,ICO&api_key=${API_KEY}`,
        {
          headers: {
            'Authorization': `Apikey ${API_KEY}`
          }
        }
      );

      if (!response.data || !response.data.Data) {
        throw new Error('Invalid news data received');
      }

      const formattedNews = response.data.Data
        .filter(article => article.title && article.url && article.imageurl)
        .slice(0, 6)
        .map(article => ({
          title: article.title,
          url: article.url,
          source: article.source_info?.name || article.source,
          image: article.imageurl,
          time: new Date(article.published_on * 1000).toLocaleString()
        }));

      if (formattedNews.length === 0) {
        throw new Error('No valid news articles found');
      }

      setNewsData(formattedNews);
    } catch (error) {
      console.error('Failed to fetch news:', error);
      setNewsData([{
        title: "Unable to load news feed",
        url: "#",
        source: "System",
        image: "https://via.placeholder.com/80x60?text=News",
        time: new Date().toLocaleString()
      }]);
    } finally {
      setNewsLoading(false);
    }
  }, [setNewsData, setNewsLoading]); // Add state setters as dependencies

  // Update the CryptoNews component
  const CryptoNews = memo(({ newsData, isLoading }) => {
    if (isLoading) {
  return (
        <div className="crypto-news">
          <div className="news-header">
            <h3>Trending News</h3>
          </div>
          <LoadingOverlay />
        </div>
      );
    }

    return (
      <div className="crypto-news">
        <div className="news-header">
          <h3>Trending News</h3>
          {!isLoading && (!newsData || newsData.length === 0) && (
            <p className="news-error">Unable to load news</p>
          )}
        </div>
        <div className="news-list">
          {newsData.map((news, index) => (
            <a 
              key={`${news.url}-${index}`}
              href={news.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="news-item"
            >
              <div className="news-image">
                <img 
                  src={news.image} 
                  alt={news.title}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/80x60?text=News';
                  }}
                />
              </div>
              <div className="news-content">
                <h4>{news.title}</h4>
                <div className="news-meta">
                  <span className="news-source">{news.source}</span>
                  <span className="news-time">{news.time}</span>
              </div>
            </div>
            </a>
          ))}
        </div>
      </div>
    );
  });

  // Update the useEffect to properly handle the fetchCryptoNews dependency
  useEffect(() => {
    let isMounted = true;
    
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchCryptoData(),
          fetchMarketPressure(),
          fetchExchangeReserves(),
          fetchEtfFlows(),
          fetchHistoricalData('BTC', timeRange),
          fetchHistoricalData('ETH', timeRange),
          fetchCryptoNews()
        ]);
        if (isMounted) {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInitialData();

    // Set up intervals with proper cleanup
    const intervals = [
      { fn: fetchCryptoData, delay: 5000 },
      { fn: fetchMarketPressure, delay: 5100 },
      { fn: fetchExchangeReserves, delay: 30200 },
      { fn: fetchEtfFlows, delay: 300300 },
      { fn: fetchCryptoNews, delay: 300000 }
    ];

    const cleanupIntervals = intervals.map(({ fn, delay }) => {
      const interval = setInterval(() => {
        if (isMounted) fn();
      }, delay);
      return interval;
    });

    return () => {
      isMounted = false;
      cleanupIntervals.forEach(clearInterval);
    };
  }, [
    fetchHistoricalData,
    timeRange,
    fetchEtfFlows,
    fetchCryptoNews,
    fetchCryptoData,
    fetchMarketPressure,
    fetchExchangeReserves
  ]); // Include all function dependencies

  // Calculate price and market cap changes for the selected time range
  const calculateChanges = useCallback((historicalPrices) => {
    if (!historicalPrices || historicalPrices.length === 0) {
      return {
        dailyChange: 0,
        weeklyChange: 0,
        monthlyChange: 0,
        yearlyChange: 0
      };
    }

    const latest = historicalPrices[historicalPrices.length - 1];
    const yesterday = historicalPrices.find(p => {
      const date = new Date(p.date);
      const latestDate = new Date(latest.date);
      return date.getDate() === latestDate.getDate() - 1 || 
             (latestDate.getDate() === 1 && date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate());
    }) || historicalPrices[historicalPrices.length - 2] || latest;
    
    const lastWeek = historicalPrices.find(p => {
      const date = new Date(p.date);
      const latestDate = new Date(latest.date);
      return Math.abs(date - latestDate) / (1000 * 60 * 60 * 24) >= 7 && 
             Math.abs(date - latestDate) / (1000 * 60 * 60 * 24) < 8;
    }) || historicalPrices[Math.max(0, historicalPrices.length - 8)] || latest;
    
    const lastMonth = historicalPrices.find(p => {
      const date = new Date(p.date);
      const latestDate = new Date(latest.date);
      return date.getMonth() === (latestDate.getMonth() === 0 ? 11 : latestDate.getMonth() - 1);
    }) || historicalPrices[Math.max(0, historicalPrices.length - 31)] || latest;
    
    const lastYear = historicalPrices.find(p => {
      const date = new Date(p.date);
      const latestDate = new Date(latest.date);
      return date.getFullYear() === latestDate.getFullYear() - 1 && 
             date.getMonth() === latestDate.getMonth();
    }) || historicalPrices[0] || latest;

    return {
      dailyChange: ((latest.price - yesterday.price) / yesterday.price) * 100,
      weeklyChange: ((latest.price - lastWeek.price) / lastWeek.price) * 100,
      monthlyChange: ((latest.price - lastMonth.price) / lastMonth.price) * 100,
      yearlyChange: ((latest.price - lastYear.price) / lastYear.price) * 100
    };
  }, []);

  // Update the crypto card render with memoization
  const renderCryptoCard = useCallback((crypto, index) => {
    const changes = calculateChanges(historicalData[crypto.id]);
    const timeRangeDisplay = timeRange === '24h' ? '24h' : 
                            timeRange === '7d' ? '7d' : 
                            timeRange === '1m' ? '30d' : 'All Time';

    // Format market cap with appropriate suffix (B/T)
    const formatMarketCap = (mcap) => {
      if (mcap >= 1e12) return `$${(mcap / 1e12).toFixed(2)}T`;
      return `$${(mcap / 1e9).toFixed(2)}B`;
    };

    return (
      <div key={crypto.id} className={`crypto-card ${index === 0 ? 'leader' : ''}`}>
        <div className="crypto-info">
          <div className="crypto-header">
            <img src={crypto.image} alt={crypto.name} width="32" height="32" />
            <h2>{crypto.name}</h2>
          </div>
          <div className="crypto-price">
            ${Number(crypto.current_price).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
                </div>
          <div className={`price-change ${changes.dailyChange >= 0 ? 'positive' : 'negative'}`}>
            {changes.dailyChange > 0 ? '+' : ''}{changes.dailyChange.toFixed(2)}% ({timeRangeDisplay})
                </div>
              </div>
        <div className="crypto-stats">
          <div className="mcap">
            MCap: {formatMarketCap(crypto.market_cap)}
            </div>
          <div className={`price-change ${changes.yearlyChange >= 0 ? 'positive' : 'negative'}`}>
            {changes.yearlyChange > 0 ? '+' : ''}{changes.yearlyChange.toFixed(2)}% ({timeRangeDisplay})
                </div>
                </div>
              </div>
    );
  }, [historicalData, timeRange, calculateChanges]);

  if (!cryptoData) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="error">{error}</div>;

  // Use cryptoData directly instead of creating an unused sortedCrypto variable
  const cryptoCards = cryptoData.map((crypto, index) => renderCryptoCard(crypto, index));

  // Calculate price ratio and store historical data
  const btcData = cryptoData.find(crypto => crypto.id === 'bitcoin');
  const ethData = cryptoData.find(crypto => crypto.id === 'ethereum');
  const currentRatio = btcData && ethData ? (ethData.current_price / btcData.current_price).toFixed(4) : 'N/A';

  // Market Pressure Section
  const PressureBarChart = ({ symbol, data }) => {
    const [showMA10, setShowMA10] = useState(true);
    const [selectedTimeframe, setSelectedTimeframe] = useState(() => {
      // Get saved timeframe from localStorage or default to '5m'
      const saved = localStorage.getItem(`${symbol}_timeframe`);
      return saved || '5m';
    });
    const chartRef = useRef(null);

    // Save timeframe to localStorage when it changes
    useEffect(() => {
      localStorage.setItem(`${symbol}_timeframe`, selectedTimeframe);
    }, [selectedTimeframe, symbol]);

    // Destroy chart on unmount - Fix the dependency array
    useEffect(() => {
      if (chartRef.current) {
        const chart = chartRef.current;
        
        // Return cleanup function
        return () => {
          if (chart) {
            chart.destroy();
          }
        };
      }
    }, []); // Empty dependency array since we only need to clean up on unmount

    const colors = {
      BTC: {
        primary: '#f1c40f',
        MA10: 'rgba(241, 196, 15, 0.8)',
        text: '#f1c40f'
      },
      ETH: {
        primary: '#2ecc71',
        MA10: 'rgba(46, 204, 113, 0.8)',
        text: '#2ecc71'
      }
    };

    const timeframeData = data[selectedTimeframe] || [];

    return (
      <div className="pressure-chart-container">
        <div className="chart-header">
          <div className="chart-title">
            <h3 style={{ color: colors[symbol].text }}>
              {symbol === 'BTC' ? 'Bitcoin' : 'Ethereum'} Market Pressure
            </h3>
            <div className="chart-subtitle">
              {symbol === 'BTC' ? 'BTC/USDT' : 'ETH/USDT'}
            </div>
          </div>
          <div className="chart-controls">
            <div className="timeframe-selector">
              {['5m', '30m', '1h'].map(tf => (
                <button
                  key={tf}
                  className={`timeframe-button ${selectedTimeframe === tf ? 'active' : ''}`}
                  onClick={() => setSelectedTimeframe(tf)}
                >
                  {tf}
                </button>
              ))}
                </div>
            <div className="ma-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={showMA10}
                  onChange={() => setShowMA10(!showMA10)}
                />
                <span style={{ color: colors[symbol].text }}>Trend Line</span>
              </label>
                </div>
              </div>
            </div>
        <Bar
          ref={chartRef}
          data={{
            labels: timeframeData.map(d => d.time),
            datasets: [
              {
                type: 'bar',
                label: 'Market Pressure',
                data: timeframeData.map(d => d.pressure),
                backgroundColor: function(context) {
                  const value = context.raw;
                  return value >= 0 ? colors[symbol].primary : '#ff7675';
                },
                barPercentage: 0.8
              },
              ...(showMA10 ? [{
                type: 'line',
                label: 'Trend',
                data: timeframeData.map(d => d.MA10),
                borderColor: colors[symbol].MA10,
                borderWidth: 2,
                pointRadius: 0
              }] : [])
            ]
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'index',
              intersect: false,
            },
            plugins: {
              tooltip: {
                callbacks: {
                  title: (tooltipItems) => {
                    return `${symbol === 'BTC' ? 'Bitcoin' : 'Ethereum'} - ${tooltipItems[0].label}`;
                  },
                  label: (context) => {
                    const dataPoint = timeframeData[context.dataIndex];
                    const pressure = Math.abs(dataPoint.pressure).toFixed(1);
                    return dataPoint.pressure >= 0 
                      ? `Buy Pressure: ${pressure}%`
                      : `Sell Pressure: ${pressure}%`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: {
                  display: false
                },
                ticks: {
                  maxRotation: 0,
                  autoSkip: true,
                  maxTicksLimit: 8,
                  font: {
                    size: 11
                  }
                },
                border: {
                  display: false
                }
              },
              y: {
                position: 'right',
                min: -30,
                max: 30,
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)',
                  drawBorder: false
                },
                ticks: {
                  padding: 8,
                  stepSize: 10,
                  font: {
                    size: 11
                  }
                },
                border: {
                  display: false
                }
              }
            },
            layout: {
              padding: {
                top: 10,
                right: 10,
                bottom: 10,
                left: 10
              }
            }
          }}
        />
                </div>
    );
  };

  return (
    <div className="dashboard">
      <h1>ETH vs BTC Dashboard</h1>
      
      {/* Combined Price Chart and News Section */}
      <div className="chart-news-container">
        <div className="combined-chart-section">
          <div className="section-header">
            <h2>Price Comparison</h2>
            <DataFreshness timestamp={dataFreshness.prices} />
                </div>
          <div className="chart-container">
            <TimeRangeSelector activeRange={timeRange} onRangeChange={handleTimeRangeChange} />
            <CombinedCryptoChart 
              btcData={historicalData.bitcoin}
              ethData={historicalData.ethereum}
              timeRange={timeRange}
            />
              </div>
            </div>
        
        <CryptoNews 
          newsData={newsData}
          isLoading={newsLoading}
        />
          </div>

      {/* Scoreboard Section */}
      <div className="scoreboard">
        <div className="section-header">
          <h2>Crypto Leaderboard</h2>
          <DataFreshness timestamp={dataFreshness.prices} />
            </div>
        <div className={`crypto-cards ${loading.prices ? 'loading-section' : ''}`}>
          {loading.prices && <LoadingOverlay />}
          {cryptoCards}
            </div>
      </div>

      {/* Market Pressure Section */}
      {marketPressure && (
        <div className="market-pressure">
          <div className="section-header">
            <h2>Market Pressure</h2>
            <DataFreshness timestamp={dataFreshness.pressure} />
          </div>
          <div className="pressure-charts">
            <PressureBarChart 
              symbol="BTC"
              data={marketPressure?.bitcoin?.timeframes || {}}
            />
            <PressureBarChart 
              symbol="ETH"
              data={marketPressure?.ethereum?.timeframes || {}}
            />
          </div>
        </div>
      )}

      {/* ETF Flows Section - Pass the state from App component */}
      <ETFFlowsSection 
        etfData={etfData} 
        isLoading={etfLoading} 
        dataFreshness={dataFreshness.etf} 
      />

      {/* Exchange Reserves Section */}
      {exchangeReserves && (
        <div className="exchange-reserves">
          <div className="section-header">
          <h2>Exchange Reserves</h2>
            <DataFreshness timestamp={dataFreshness.reserves} />
          </div>
          <div className="reserves-cards">
            <div className="reserves-card">
              <div className="reserves-header">
                <img src="https://assets.coingecko.com/coins/images/1/small/bitcoin.png" alt="BTC" className="crypto-icon" />
                <h3>Bitcoin</h3>
              </div>
              <p>{exchangeReserves.bitcoin ? Number(exchangeReserves.bitcoin).toLocaleString(undefined, {maximumFractionDigits: 2}) : '0'} BTC</p>
              <span className="reserves-note">Based on 24h volume</span>
            </div>
            <div className="reserves-card">
              <div className="reserves-header">
                <img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png" alt="ETH" className="crypto-icon" />
              <h3>Ethereum</h3>
              </div>
              <p>{exchangeReserves.ethereum ? Number(exchangeReserves.ethereum).toLocaleString(undefined, {maximumFractionDigits: 2}) : '0'} ETH</p>
              <span className="reserves-note">Based on 24h volume</span>
            </div>
          </div>
        </div>
      )}

      {/* ETH/BTC Ratio Section */}
      <div className="price-ratio">
        <div className="section-header">
          <h2>ETH/BTC Price Ratio</h2>
          <DataFreshness timestamp={dataFreshness.prices} />
        </div>
        <div className="ratio-card">
          <div className="ratio-header">
            <div className="current-ratio-container">
              <div className="ratio-main-value">
                <p className="current-ratio-label">Current Ratio:</p>
                <p className="current-ratio-value">{currentRatio}</p>
              </div>
          {priceRatio.length > 1 && (
                <div className="ratio-change-container">
                  <p className={`ratio-change ${
                    priceRatio[priceRatio.length-1].ratio > priceRatio[0].ratio ? 'positive' : 'negative'
                  }`}>
                    {priceRatio.length > 1 ? (
                      ((priceRatio[priceRatio.length-1].ratio - priceRatio[0].ratio) / 
                      priceRatio[0].ratio * 100).toFixed(2)
                    ) : '0.00'}%
                    <span className="change-arrow">
                      {priceRatio[priceRatio.length-1].ratio > priceRatio[0].ratio ? '↑' : '↓'}
                    </span>
                  </p>
                  <p className="change-period">24h change</p>
                </div>
              )}
            </div>
            <div className="ratio-explanation">
              <div className="explanation-icon">ℹ️</div>
              <p>Higher values indicate ETH is gaining value relative to BTC</p>
            </div>
          </div>
          
          {/* Price comparison */}
          <div className="ratio-price-comparison">
            <div className="price-item btc">
              <img src="https://assets.coingecko.com/coins/images/1/small/bitcoin.png" alt="BTC" className="crypto-icon" />
              <div className="price-details">
                <p className="price-label">BTC</p>
                <p className="price-value">${btcData ? btcData.current_price.toLocaleString() : '0'}</p>
              </div>
            </div>
            <div className="ratio-divider">÷</div>
            <div className="price-item eth">
              <img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png" alt="ETH" className="crypto-icon" />
              <div className="price-details">
                <p className="price-label">ETH</p>
                <p className="price-value">${ethData ? ethData.current_price.toLocaleString() : '0'}</p>
              </div>
            </div>
            <div className="ratio-equals">=</div>
            <div className="ratio-result">
              <p className="result-value">{currentRatio}</p>
            </div>
          </div>
          
          <div className="ratio-chart-container">
            <Line
              data={{
                labels: priceRatio.map(item => {
                  const date = new Date(item.timestamp || new Date()); 
                  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }),
                datasets: [
                  {
                    label: 'ETH/BTC Ratio',
                    data: priceRatio.map(item => item.ratio),
                    fill: {
                      target: 'origin',
                      above: 'rgba(46, 204, 113, 0.1)',   // Green tint above the line
                    },
                    backgroundColor: '#2ecc71',
                    borderColor: '#2ecc71',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: '#2ecc71',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                    tension: 0.4,
                    // Store original data for tooltip
                    btcPrices: priceRatio.map(item => item.btcPrice),
                    ethPrices: priceRatio.map(item => item.ethPrice),
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                  mode: 'index',
                  intersect: false,
                },
                plugins: {
                  legend: {
                    display: false
                  },
                  tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    titleColor: '#666',
                    bodyColor: '#666',
                    borderColor: '#ddd',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                      title: (context) => {
                        return `ETH/BTC Ratio at ${context[0].label}`;
                      }
                    }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App; 