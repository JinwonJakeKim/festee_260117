import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, User, MapPin, MessageCircle, Heart, Search, Bell, Trash2, Mail, Camera } from "lucide-react";

const Section = ({ icon: SectionIcon, iconColor, title, children }) => (
  <div className="mb-8">
    <div className="flex items-center gap-3 mb-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gray-800`}>
        <SectionIcon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <h2 className="text-white font-bold text-base">{title}</h2>
    </div>
    <div className="text-gray-400 text-sm leading-relaxed space-y-2 pl-1">
      {children}
    </div>
  </div>
);

const Item = ({ children }) => (
  <div className="flex gap-2">
    <span className="text-cyan-400 mt-0.5 flex-shrink-0">•</span>
    <span>{children}</span>
  </div>
);

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">개인정보 처리방침</h1>
        </div>
      </div>

      <div className="px-5 pt-6">
        {/* 인트로 */}
        <div className="bg-gray-900 rounded-2xl p-5 mb-8 border border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-6 h-6 text-cyan-400" />
            <span className="text-white font-bold text-base">Festee 개인정보 처리방침</span>
          </div>
          <p className="text-gray-400 text-sm leading-relaxed">
            Festee(이하 "서비스")는 사용자의 개인정보를 중요하게 생각합니다. 본 방침은 서비스 이용 과정에서 수집되는 정보와 그 처리 방법을 안내합니다.
          </p>
          <p className="text-gray-500 text-xs mt-3">시행일: 2025년 1월 1일 · 최종 수정: 2026년 4월 28일</p>
        </div>

        {/* 1. 수집하는 정보 */}
        <Section icon={User} iconColor="text-cyan-400" title="1. 수집하는 개인정보">
          <p className="text-gray-500 text-xs mb-2">서비스 이용 시 다음 정보가 수집될 수 있습니다.</p>
          <Item><strong className="text-gray-300">계정 정보</strong>: 이메일 주소, 이름 (가입 시 제공)</Item>
          <Item><strong className="text-gray-300">활동 정보</strong>: 축제 좋아요, 캐치(방문 인증), 댓글, 커뮤니티 게시글, 팔로우 관계</Item>
          <Item><strong className="text-gray-300">검색 기록</strong>: 검색어 및 검색 시간 (서비스 개선 목적)</Item>
          <Item><strong className="text-gray-300">위치 정보</strong>: 캐치 기능 이용 시 사용자의 현재 위치 (GPS). 기기 권한 허용 시에만 수집되며 서버에 저장되지 않습니다.</Item>
          <Item><strong className="text-gray-300">기기 정보</strong>: 피드백 제출 시 기기 유형 정보 (선택)</Item>
          <Item><strong className="text-gray-300">서비스 이용 기록</strong>: 앱 내 활동 로그 (오류 분석 및 서비스 품질 개선 목적)</Item>
        </Section>

        {/* 2. 이용 목적 */}
        <Section icon={Shield} iconColor="text-green-400" title="2. 개인정보 이용 목적">
          <Item>Festee 서비스 제공 및 운영 (축제 추천, 커뮤니티, 메시지 등)</Item>
          <Item>개인화된 축제 추천 및 관심 콘텐츠 제공</Item>
          <Item>캐치(방문 인증) 기능의 위치 기반 유효성 검증</Item>
          <Item>서비스 개선, 신규 기능 개발 및 품질 향상</Item>
          <Item>사용자 문의 및 피드백 처리</Item>
          <Item>서비스 이용약관 위반 등 부정 이용 방지</Item>
        </Section>

        {/* 3. 위치 정보 */}
        <Section icon={MapPin} iconColor="text-pink-400" title="3. 위치 정보 처리">
          <p>위치 정보는 아래 목적으로만 사용됩니다.</p>
          <Item>캐치 기능: 사용자가 축제 현장 500m 이내에 있는지 확인하기 위해 일시적으로 사용됩니다. 위치 데이터는 서버에 저장되지 않습니다.</Item>
          <Item>지도 페이지: 현재 위치를 지도 중심으로 설정하기 위해 기기 내에서만 처리됩니다.</Item>
          <Item>위치 권한은 언제든지 기기 설정에서 철회할 수 있으며, 권한 없이도 대부분의 서비스를 이용할 수 있습니다.</Item>
        </Section>

        {/* 4. 카메라 */}
        <Section icon={Camera} iconColor="text-yellow-400" title="4. 카메라 사용">
          <p>카메라 권한은 아래 목적으로만 사용됩니다.</p>
          <Item><strong className="text-gray-300">캐치(방문 인증) 기능</strong>: 사용자가 축제 현장에서 사진을 촬영하여 방문을 인증할 때 카메라가 사용됩니다.</Item>
          <Item><strong className="text-gray-300">프로필 사진 등록</strong>: 사용자가 직접 카메라로 촬영하여 프로필 이미지를 설정할 때 사용됩니다.</Item>
          <Item>촬영된 사진 중 사용자가 직접 업로드한 이미지는 Festee 서버에 저장되며, 업로드하지 않은 사진은 앱 외부로 전송되지 않습니다.</Item>
          <Item>카메라 권한은 언제든지 기기 설정에서 철회할 수 있으며, 권한 없이도 기존에 저장된 이미지를 사용하거나 다른 기능을 이용할 수 있습니다.</Item>
        </Section>

        {/* 6. 정보 공유 */}
        <Section icon={MessageCircle} iconColor="text-purple-400" title="5. 개인정보 제3자 제공">
          <p>Festee는 원칙적으로 사용자의 개인정보를 외부에 제공하지 않습니다. 다만, 다음의 경우는 예외입니다.</p>
          <Item>사용자가 직접 동의한 경우</Item>
          <Item>법령에 의거하거나 수사기관의 적법한 요청이 있는 경우</Item>
          <p className="mt-2">서비스 운영을 위해 아래 외부 서비스를 활용합니다.</p>
          <Item><strong className="text-gray-300">Google API</strong>: 지도, 번역, 유튜브 영상 제공</Item>
          <Item><strong className="text-gray-300">Base44 플랫폼</strong>: 데이터 저장 및 인증 (서비스 제공자)</Item>
        </Section>

        {/* 5. 보존 기간 */}
        <Section icon={Trash2} iconColor="text-orange-400" title="6. 개인정보 보존 및 삭제">
          <Item>계정 및 활동 정보는 서비스 이용 기간 동안 보존됩니다.</Item>
          <Item>계정 삭제(탈퇴) 시 관련 개인정보는 즉시 삭제 처리됩니다.</Item>
          <Item>검색 기록은 서비스 통계 개선을 위해 익명화 후 최대 1년간 보존될 수 있습니다.</Item>
          <Item>법령에서 일정 기간 보존을 요구하는 경우 해당 기간 동안 별도 보존됩니다.</Item>
        </Section>

        {/* 6. 사용자 권리 */}
        <Section icon={Heart} iconColor="text-pink-500" title="7. 사용자의 권리">
          <p>사용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
          <Item>본인의 개인정보 열람 및 수정</Item>
          <Item>개인정보 처리 동의 철회</Item>
          <Item>계정 삭제 및 개인정보 삭제 요청 (설정 → 계정 관리)</Item>
          <Item>마케팅/알림 수신 거부 (설정 → 알림 설정)</Item>
        </Section>

        {/* 7. 알림 */}
        <Section icon={Bell} iconColor="text-yellow-400" title="8. 알림 및 마케팅">
          <Item>서비스 관련 중요 알림(보안, 계정 등)은 동의와 관계없이 발송될 수 있습니다.</Item>
          <Item>축제 알림, 팔로워 알림 등 개인화 알림은 설정 페이지에서 언제든지 끌 수 있습니다.</Item>
          <Item>마케팅 이메일은 별도 동의 시에만 발송됩니다.</Item>
        </Section>

        {/* 8. 검색 기록 */}
        <Section icon={Search} iconColor="text-blue-400" title="9. 검색 기록">
          <Item>검색어는 서비스 트렌드 파악 및 추천 기능 개선에 활용됩니다.</Item>
          <Item>비로그인 상태의 검색은 사용자 식별 없이 익명으로 저장됩니다.</Item>
          <Item>개인 검색 기록은 서비스 내 삭제 기능을 통해 직접 삭제할 수 있습니다.</Item>
        </Section>

        {/* 9. YouTube 데이터 및 API 이용 */}
        <Section icon={Search} iconColor="text-red-400" title="10. YouTube 데이터 및 API 이용">
          <p>Festee는 축제 관련 영상 정보를 제공하기 위해 YouTube Data API v3를 활용합니다.</p>
          <Item><strong className="text-gray-300">표시 영상</strong>: 축제 상세 페이지에 하이라이트 영상과 Shorts 영상 URL을 표시하며, 해당 영상은 YouTube 플랫폼에서 직접 재생됩니다.</Item>
          <Item><strong className="text-gray-300">수집 정보</strong>: 검색 결과로 표시되는 영상의 제목, 채널명, 조회수, 영상 ID 등 공개 메타데이터만 활용합니다.</Item>
          <Item><strong className="text-gray-300">사용자 데이터</strong>: Festee는 YouTube API 호출 시 사용자의 개인 식별 정보나 시청 기록을 YouTube에 전송하지 않으며, API 사용은 YouTube API 서비스 약관(https://developers.google.com/youtube/terms/api-services-terms-of-service) 및 개인정보처리방침(https://policies.google.com/privacy)을 준수합니다.</Item>
          <Item><strong className="text-gray-300">영상 소유권</strong>: 표시되는 모든 영상의 소유권과 저작권은 원작자 및 YouTube에 귀속되며, Festee는 임베드된 영상을 링크 형태로만 제공합니다.</Item>
          <Item>YouTube API를 통해 가져온 영상 메타데이터는 서비스 품질 향상(축제 인기도 산출 등)을 위해 보존되며, 사용자는 언제든지 동의 철회 및 열람을 요청할 수 있습니다.</Item>
        </Section>

        {/* 10. 문의 */}
        <Section icon={Mail} iconColor="text-cyan-400" title="11. 개인정보 관련 문의">
          <p>개인정보 처리에 관한 문의사항은 앱 내 <strong className="text-gray-300">설정 → 피드백 보내기</strong>를 통해 접수해 주세요.</p>
          <p className="mt-2 text-gray-500">Festee는 본 방침을 변경할 경우 앱 내 공지사항을 통해 7일 전 사전 안내합니다.</p>
        </Section>

        <div className="border-t border-gray-800 pt-6 pb-4 text-center">
          <p className="text-gray-600 text-xs">© 2026 Festee. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}