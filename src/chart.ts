/**
 * 차트 생성 모듈
 * QuickChart.io를 사용하여 차트 이미지 생성
 */

// 네이버 주식 차트 API URL
const CHART_API_URLS = {
  KOSPI: 'https://api.stock.naver.com/chart/domestic/index/KOSPI?periodType=dayCandle',
  USD: 'https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=FX_USDKRW&page=1',
} as const;

// QuickChart API
const QUICKCHART_URL = 'https://quickchart.io/chart';

interface ChartDataPoint {
  date: string;
  value: number;
}

// 네이버 차트 API 응답 타입 (코스피/코스닥)
interface NaverIndexChartResponse {
  priceInfos?: Array<{
    localDate: string;
    closePrice: number;
  }>;
}

// 네이버 환율 API 응답 타입
interface NaverExchangePriceItem {
  localTradedAt: string;  // "2025-11-28"
  closePrice: string;     // "1,469.10" (문자열, 쉼표 포함)
}

interface NaverExchangeApiResponse {
  isSuccess: boolean;
  result: NaverExchangePriceItem[];
}

/**
 * 코스피/코스닥 차트 데이터 가져오기
 */
async function fetchIndexChartData(): Promise<ChartDataPoint[]> {
  try {
    const response = await fetch(CHART_API_URLS.KOSPI, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`KOSPI API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as NaverIndexChartResponse;
    
    if (!data.priceInfos || data.priceInfos.length === 0) {
      console.error('No KOSPI price data');
      return [];
    }

    const recentData = data.priceInfos.slice(-7);
    
    return recentData.map(item => {
      const dateStr = item.localDate;
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      
      return {
        date: `${month}/${day}`,
        value: item.closePrice,
      };
    });
  } catch (error) {
    console.error('Error fetching KOSPI chart data:', error);
    return [];
  }
}

/**
 * USD 환율 차트 데이터 가져오기
 */
async function fetchUsdChartData(): Promise<ChartDataPoint[]> {
  try {
    const response = await fetch(CHART_API_URLS.USD, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`USD API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as NaverExchangeApiResponse;
    
    if (!data.isSuccess || !data.result || data.result.length === 0) {
      console.error('No USD price data in response');
      return [];
    }

    // 최근 7개 데이터 (최신순으로 정렬되어 있으므로 reverse)
    const recentData = data.result.slice(0, 7).reverse();
    
    return recentData.map(item => {
      // localTradedAt: "2025-11-28"
      const [, month, day] = item.localTradedAt.split('-');
      
      // closePrice: "1,469.10" -> 숫자로 변환
      const value = parseFloat(item.closePrice.replace(/,/g, ''));
      
      return { date: `${month}/${day}`, value };
    });
  } catch (error) {
    console.error('Error fetching USD chart data:', error);
    return [];
  }
}

/**
 * QuickChart URL 생성
 */
function generateChartUrl(
  data: ChartDataPoint[],
  title: string,
  color: string
): string {
  const labels = data.map(d => d.date);
  const values = data.map(d => d.value);
  
  // 최소/최대값 계산 (여유 있게)
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = (maxValue - minValue) * 0.15;
  
  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: title,
        data: values,
        fill: true,
        backgroundColor: `${color}30`,
        borderColor: color,
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: color,
        tension: 0.3,
      }],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `${title} - 최근 7일`,
          font: { size: 18, weight: 'bold' },
        },
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          min: Math.floor(minValue - padding),
          max: Math.ceil(maxValue + padding),
          ticks: {
            font: { size: 12 },
          },
        },
        x: {
          ticks: {
            font: { size: 12 },
          },
        },
      },
    },
  };

  const chartJson = encodeURIComponent(JSON.stringify(chartConfig));
  return `${QUICKCHART_URL}?c=${chartJson}&w=600&h=400&bkg=white`;
}

/**
 * 코스피 7일 차트 URL 생성
 */
export async function getKospiChartUrl(): Promise<string | null> {
  try {
    const data = await fetchIndexChartData();
    console.log('KOSPI chart data:', data.length, 'points');
    
    if (data.length === 0) return null;
    
    return generateChartUrl(data, '코스피 (KOSPI)', '#e74c3c');
  } catch (error) {
    console.error('Error generating KOSPI chart:', error);
    return null;
  }
}

/**
 * USD 환율 7일 차트 URL 생성
 */
export async function getUsdChartUrl(): Promise<string | null> {
  try {
    const data = await fetchUsdChartData();
    console.log('USD chart data:', data.length, 'points');
    
    if (data.length === 0) return null;
    
    return generateChartUrl(data, 'USD/KRW 환율', '#3498db');
  } catch (error) {
    console.error('Error generating USD chart:', error);
    return null;
  }
}

/**
 * 모든 차트 URL 가져오기
 */
export async function getAllChartUrls(): Promise<{
  kospi: string | null;
  usd: string | null;
}> {
  const [kospi, usd] = await Promise.all([
    getKospiChartUrl(),
    getUsdChartUrl(),
  ]);

  console.log('Chart URLs generated:', { kospi: !!kospi, usd: !!usd });

  return { kospi, usd };
}
