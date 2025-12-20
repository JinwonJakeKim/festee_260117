import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, Calendar as CalendarIcon, MapPin as MapPinIcon, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function AdminEventbrite() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [eventbriteLocation, setEventbriteLocation] = useState("");
  const [eventbriteKeyword, setEventbriteKeyword] = useState("");
  const [eventbriteResults, setEventbriteResults] = useState([]);
  const [isSearchingEventbrite, setIsSearchingEventbrite] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      alert('관리자 권한이 필요합니다');
      navigate(-1);
    }
  }, [user, isLoading, navigate]);

  const handleSearchEventbrite = async () => {
    if (!eventbriteLocation && !eventbriteKeyword) {
      alert('검색할 위치나 키워드를 입력해주세요');
      return;
    }

    setIsSearchingEventbrite(true);
    setEventbriteResults([]);

    try {
      const { data } = await base44.functions.invoke('searchEventbriteEvents', {
        location: eventbriteLocation,
        keyword: eventbriteKeyword
      });

      if (data.events) {
        setEventbriteResults(data.events);
      } else {
        alert('검색 결과가 없습니다');
      }
    } catch (error) {
      console.error('Eventbrite search error:', error);
      alert('검색 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsSearchingEventbrite(false);
    }
  };

  const handleAddEventbriteEvent = async (event) => {
    try {
      const festivalData = {
        name: event.name.text,
        name_en: event.name.text,
        summary: event.description?.text || event.summary || '',
        summary_en: event.description?.text || event.summary || '',
        description: event.description?.text || '',
        description_en: event.description?.text || '',
        country: event.venue?.address?.country || '',
        city: event.venue?.address?.city || '',
        category: event.category?.name || '기타',
        start_date: event.start?.local?.split('T')[0] || '',
        end_date: event.end?.local?.split('T')[0] || '',
        latitude: event.venue?.latitude ? parseFloat(event.venue.latitude) : undefined,
        longitude: event.venue?.longitude ? parseFloat(event.venue.longitude) : undefined,
        thumbnail_url: event.logo?.url || 'https://picsum.photos/seed/' + event.id + '/800/600',
        website: event.url || '',
        organizer: event.organizer?.name || '',
      };

      await base44.entities.Festival.create(festivalData);
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      alert('축제가 성공적으로 추가되었습니다!');
    } catch (error) {
      console.error('Error adding festival:', error);
      alert('축제 추가 중 오류가 발생했습니다: ' + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">EventbriteAPI 해외 축제 연동</h1>
            <p className="text-gray-400 text-sm">Eventbrite Event Integration</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <Card className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border-orange-400/30 p-4 mb-4">
          <h3 className="text-white font-bold mb-2 flex items-center gap-2">
            <Globe className="w-5 h-5 text-orange-400" />
            Eventbrite 이벤트 검색
          </h3>
          <p className="text-gray-300 text-sm">
            Eventbrite에서 이벤트를 검색하고 축제로 추가할 수 있습니다.
          </p>
        </Card>

        {/* 검색 폼 */}
        <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
          <div className="space-y-3">
            <div>
              <label className="text-gray-400 text-sm mb-2 block">위치 (도시명)</label>
              <Input
                value={eventbriteLocation}
                onChange={(e) => setEventbriteLocation(e.target.value)}
                placeholder="예: Tokyo, Paris, New York"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-2 block">키워드</label>
              <Input
                value={eventbriteKeyword}
                onChange={(e) => setEventbriteKeyword(e.target.value)}
                placeholder="예: music festival, art, food"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <Button
              onClick={handleSearchEventbrite}
              disabled={isSearchingEventbrite}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            >
              {isSearchingEventbrite ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  검색 중...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  이벤트 검색
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* 검색 결과 */}
        {eventbriteResults.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-white font-bold">검색 결과 ({eventbriteResults.length}개)</h3>
            {eventbriteResults.map((event) => (
              <Card key={event.id} className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start gap-3">
                  {event.logo?.url && (
                    <img
                      src={event.logo.url}
                      alt={event.name.text}
                      className="w-20 h-20 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h4 className="text-white font-bold mb-2">{event.name.text}</h4>
                    {event.venue && (
                      <p className="text-gray-400 text-sm mb-1 flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3" />
                        {event.venue.address?.city}, {event.venue.address?.country}
                      </p>
                    )}
                    {event.start && (
                      <p className="text-gray-400 text-sm mb-1 flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3" />
                        {new Date(event.start.local).toLocaleDateString('ko-KR')}
                      </p>
                    )}
                    {event.category && (
                      <Badge className="bg-orange-500 text-white mt-2">
                        {event.category.name}
                      </Badge>
                    )}
                  </div>
                  <Button
                    onClick={() => handleAddEventbriteEvent(event)}
                    size="sm"
                    className="bg-cyan-500 hover:bg-cyan-600"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    추가
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {eventbriteResults.length === 0 && !isSearchingEventbrite && (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500">위치나 키워드를 입력하고 검색해주세요</p>
          </Card>
        )}
      </div>
    </div>
  );
}