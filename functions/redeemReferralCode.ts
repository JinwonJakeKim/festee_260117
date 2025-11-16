import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// 추천코드 생성 함수 (MyFestee와 동일한 로직)
const generateReferralCode = (userEmail) => {
  let hash = 0;
  for (let i = 0; i < userEmail.length; i++) {
    hash = userEmail.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  let tempHash = Math.abs(hash);
  
  for (let i = 0; i < 6; i++) {
    code += chars[tempHash % chars.length];
    tempHash = Math.floor(tempHash / chars.length);
  }
  
  return code;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // 사용자 인증 확인
    const currentUser = await base44.auth.me();
    if (!currentUser) {
      return Response.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // 요청 본문에서 추천 코드 가져오기
    const { referralCode } = await req.json();
    
    if (!referralCode || referralCode.trim() === '') {
      return Response.json({ error: '추천 코드를 입력해주세요' }, { status: 400 });
    }

    const trimmedCode = referralCode.trim().toUpperCase();

    // 1. 본인의 추천 코드인지 확인
    const myCode = generateReferralCode(currentUser.email);
    if (trimmedCode === myCode) {
      return Response.json({ error: '본인의 추천 코드는 사용할 수 없습니다' }, { status: 400 });
    }

    // 2. 이미 추천 코드를 사용한 적이 있는지 확인
    const existingReferral = await base44.entities.ReferralLog.filter({
      referred_email: currentUser.email
    });

    if (existingReferral.length > 0) {
      return Response.json({ error: '이미 추천 코드를 사용하셨습니다' }, { status: 400 });
    }

    // 3. 모든 사용자 조회하여 추천 코드가 일치하는 사용자 찾기
    const allUsers = await base44.asServiceRole.entities.User.list();
    let referrer = null;

    for (const user of allUsers) {
      const userCode = generateReferralCode(user.email);
      if (userCode === trimmedCode) {
        referrer = user;
        break;
      }
    }

    if (!referrer) {
      return Response.json({ error: '유효하지 않은 추천 코드입니다' }, { status: 404 });
    }

    // 4. 추천인과 피추천인에게 코인 지급
    const referrerCurrentCoins = referrer.coins || 0;
    const referredCurrentCoins = currentUser.coins || 0;

    await base44.asServiceRole.entities.User.update(referrer.id, {
      coins: referrerCurrentCoins + 500
    });

    await base44.asServiceRole.entities.User.update(currentUser.id, {
      coins: referredCurrentCoins + 500
    });

    // 5. ReferralLog 생성
    await base44.entities.ReferralLog.create({
      referrer_email: referrer.email,
      referrer_name: referrer.full_name,
      referrer_code: trimmedCode,
      referred_email: currentUser.email,
      referred_name: currentUser.full_name,
      coins_awarded: 500,
      status: 'completed'
    });

    return Response.json({
      success: true,
      message: `${referrer.full_name}님의 추천으로 500 코인을 받았습니다!`,
      referrerName: referrer.full_name,
      coinsAwarded: 500
    });

  } catch (error) {
    console.error('추천 코드 처리 오류:', error);
    return Response.json({ 
      error: '추천 코드 처리 중 오류가 발생했습니다',
      details: error.message 
    }, { status: 500 });
  }
});