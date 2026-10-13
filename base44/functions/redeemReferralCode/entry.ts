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

    // 2. 같은 추천 코드를 이미 사용했는지 확인 (중복 사용 방지, 다른 코드는 추가 가능)
    const existingReferrals = await base44.asServiceRole.entities.ReferralLog.filter({
      referred_email: currentUser.email
    });

    // 사용자당 1회만 추천 코드 사용 가능
    if (existingReferrals.length > 0) {
      return Response.json({ error: '이미 추천 코드를 사용했습니다' }, { status: 400 });
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

    // 4. 먼저 ReferralLog를 서비스 권한으로 생성 (중복 방지 키 역할)
    const log = await base44.asServiceRole.entities.ReferralLog.create({
      referrer_email: referrer.email,
      referrer_name: referrer.full_name,
      referrer_code: trimmedCode,
      referred_email: currentUser.email,
      referred_name: currentUser.full_name,
      coins_awarded: 500,
      status: 'completed'
    });

    // 동시 요청 방지: 같은 사용자의 로그가 2개 이상이면 가장 먼저 생성된 것만 유효
    const logs = await base44.asServiceRole.entities.ReferralLog.filter({
      referred_email: currentUser.email
    }, 'created_date', 5);
    if (logs.length > 1 && logs[0].id !== log.id) {
      await base44.asServiceRole.entities.ReferralLog.delete(log.id);
      return Response.json({ error: '이미 추천 코드를 사용했습니다' }, { status: 400 });
    }

    // 5. 추천인과 피추천인에게 코인 지급
    const referrerCurrentCoins = referrer.coins || 0;
    const referredCurrentCoins = currentUser.coins || 0;

    await base44.asServiceRole.entities.User.update(referrer.id, {
      coins: referrerCurrentCoins + 500
    });

    await base44.asServiceRole.entities.User.update(currentUser.id, {
      coins: referredCurrentCoins + 500
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