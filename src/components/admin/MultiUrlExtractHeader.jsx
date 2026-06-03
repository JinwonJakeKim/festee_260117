export default function MultiUrlExtractHeader() {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-white font-bold text-lg">멀티 URL 추출</h3>
      <div className="relative group">
        <button className="w-5 h-5 rounded-full border border-gray-500 flex items-center justify-center text-gray-400 hover:border-cyan-400 hover:text-cyan-400 text-xs transition-colors">
          ℹ
        </button>
        <div className="hidden group-hover:block absolute left-0 top-full mt-2 bg-gray-800 text-white text-xs rounded-lg p-3 border border-gray-700 shadow-lg w-64 z-10">
          <p className="font-bold text-cyan-400 mb-2">멀티 URL 추출이란?</p>
          <ul className="space-y-1 list-disc list-inside text-gray-300">
            <li>월별로 여러 축제가 나열된 목록 페이지에서 모든 링크를 한 번에 추출합니다</li>
            <li>월을 선택하면 날짜 파라미터가 적용된 URL이 생성됩니다</li>
            <li><strong className="text-cyan-400">"자동"</strong>을 선택하면 마지막 페이지를 자동으로 감지합니다</li>
            <li>특정 페이지 수를 선택하면 그 페이지까지만 추출합니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}