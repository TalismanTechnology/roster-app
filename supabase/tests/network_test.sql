-- Behavioral RPC and role tests. Run after migrations with local auth/storage shim.
begin;
grant usage on schema public,auth to authenticated,anon;
grant select,update on public.profiles to authenticated;
grant execute on function auth.uid() to authenticated,anon;
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-0000-0000-000000000001','adult@network.test',now()),
 ('10000000-0000-0000-0000-000000000002','teen@network.test',now()),
 ('10000000-0000-0000-0000-000000000003','other@network.test',now()),
 ('10000000-0000-0000-0000-000000000004','staff@network.test',now());
insert into public.profiles(id,handle,display_name,account_kind,visibility,level) values
 ('10000000-0000-0000-0000-000000000001','networkadult','Adult','athlete','private','club'),
 ('10000000-0000-0000-0000-000000000002','networkteen','Teen','athlete','private','club'),
 ('10000000-0000-0000-0000-000000000003','networkother','Other','coach','public',null),
 ('10000000-0000-0000-0000-000000000004','networkstaff','Staff','staff','public',null);
insert into public.achievements(id,profile_id,kind,title,achieved_on) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','award','Network verification fixture',current_date);
insert into public.coach_contacts(id,profile_id,name,email) values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Invited Coach','other@network.test');
insert into storage.objects(bucket_id,name,owner_id) values('roster-media','10000000-0000-0000-0000-000000000001/11111111-1111-4111-8111-111111111111.webp','10000000-0000-0000-0000-000000000001');
insert into storage.objects(bucket_id,name,owner_id) values('roster-media','10000000-0000-0000-0000-000000000001/a.webp','10000000-0000-0000-0000-000000000001');
insert into storage.objects(bucket_id,name,owner_id) values('roster-media','10000000-0000-0000-0000-000000000001/22222222-2222-4222-8222-222222222222.webp','10000000-0000-0000-0000-000000000001');
update public.profiles set cover_url='/api/media/10000000-0000-0000-0000-000000000001/22222222-2222-4222-8222-222222222222.webp' where id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ begin
 begin perform * from roster_network.members;raise exception 'private DOB table readable';exception when insufficient_privilege then null;end;
 begin perform public.network_api('discover');raise exception 'anonymous identity allowed';exception when insufficient_privilege then null;end;
end $$;
do $$ declare adult uuid:='10000000-0000-0000-0000-000000000001';teen uuid:='10000000-0000-0000-0000-000000000002';other uuid:='10000000-0000-0000-0000-000000000003';staff uuid:='10000000-0000-0000-0000-000000000004';p jsonb;c jsonb;msg jsonb;comments jsonb;r jsonb;page jsonb;begin
 perform set_config('request.jwt.claim.sub',adult::text,true);
 begin insert into storage.objects(bucket_id,name,owner_id) values('roster-media',adult::text||'/a.webp',adult::text);raise exception 'short direct upload accepted';exception when insufficient_privilege then null;end;
 update public.profiles set avatar_url='/api/media/10000000-0000-0000-0000-000000000001/11111111-1111-4111-8111-111111111111.webp' where id=adult;
 perform set_config('request.jwt.claim.sub',other::text,true);
 begin update public.profiles set avatar_url='/api/media/10000000-0000-0000-0000-000000000001/11111111-1111-4111-8111-111111111111.webp' where id=other;raise exception 'victim artwork published';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',adult::text,true);
 begin perform public.network_api('getFeed');raise exception 'legacy social read permitted';exception when insufficient_privilege then null;end;
 begin perform public.network_api('joinNetwork','{"dateOfBirth":"2020-01-01"}');raise exception 'under13 joined';exception when invalid_parameter_value then null;end;
 perform public.network_api('joinNetwork','{"dateOfBirth":"1990-01-01"}');
 begin perform public.network_api('joinNetwork','{"dateOfBirth":"1991-01-01"}');raise exception 'DOB mutable';exception when insufficient_privilege then null;end;
 if public.network_api('getMembership') ? 'dob' then raise exception 'DOB leaked';end if;
 perform set_config('request.jwt.claim.sub',teen::text,true);perform public.network_api('joinNetwork',jsonb_build_object('dateOfBirth',(current_date-interval '15 years')::date));
 perform set_config('request.jwt.claim.sub',other::text,true);perform public.network_api('joinNetwork','{"dateOfBirth":"1990-01-01"}');
 perform set_config('request.jwt.claim.sub',staff::text,true);perform public.network_api('joinNetwork','{"dateOfBirth":"1980-01-01"}');
 perform set_config('request.jwt.claim.sub',teen::text,true);
 if public.network_api('canReadMedia',jsonb_build_object('path',adult::text||'/22222222-2222-4222-8222-222222222222.webp'))::boolean then raise exception 'private cover exposed by network RPC';end if;
 if public.roster_can_read_media(adult::text||'/22222222-2222-4222-8222-222222222222.webp') then raise exception 'private cover exposed by storage';end if;
 if not public.roster_can_read_media(adult::text||'/11111111-1111-4111-8111-111111111111.webp') then raise exception 'social avatar unavailable';end if;
 perform set_config('request.jwt.claim.sub',adult::text,true);
 if not public.roster_can_read_media(adult::text||'/22222222-2222-4222-8222-222222222222.webp') then raise exception 'owner cover unavailable';end if;
 update public.profiles set visibility='unlisted' where id=adult;
 perform set_config('request.jwt.claim.sub',teen::text,true);
 if not public.roster_can_read_media(adult::text||'/22222222-2222-4222-8222-222222222222.webp') then raise exception 'unlisted cover unavailable';end if;
 perform set_config('request.jwt.claim.sub',adult::text,true);
 update public.profiles set visibility='private' where id=adult;
 r:=public.create_verification_request('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',repeat('b',64));
 perform set_config('request.jwt.claim.sub',other::text,true);
 if not exists(select 1 from jsonb_array_elements(public.network_api('getNotifications')) n where n->>'kind'='verification_request') then raise exception 'coach verification notification missing';end if;
 perform public.network_api('markNotificationsRead');
 if exists(select 1 from jsonb_array_elements(public.network_api('getNotifications')) n where n->>'kind'='verification_request' and not(n->>'read')::boolean) then raise exception 'verification read marker missing';end if;
 perform public.respond_verification_request(r->>'id','verified','Confirmed');
 perform set_config('request.jwt.claim.sub',adult::text,true);
 if not exists(select 1 from jsonb_array_elements(public.network_api('getNotifications')) n where n->>'kind'='verification_verified') then raise exception 'verification outcome notification missing';end if;
 if public.network_api('getMember','{"handle":"networkteen"}')->>'publicResumeUrl' is not null then raise exception 'private resume promoted';end if;
 begin perform public.network_api('publishPost',jsonb_build_object('text','legacy short path','images',jsonb_build_array(adult::text||'/a.webp')));raise exception 'noncanonical attachment accepted';exception when insufficient_privilege then null;end;
 p:=public.network_api('publishPost',jsonb_build_object('text','First post','images',jsonb_build_array(adult::text||'/11111111-1111-4111-8111-111111111111.webp')));
 perform public.network_api('publishPost','{"text":"Second post"}');
 page:=public.network_api('getFeed','{"limit":1}');
 if page->>'nextCursor' is null then raise exception 'cursor missing';end if;
 if public.network_api('getFeed',jsonb_build_object('limit',1,'cursor',page->>'nextCursor'))->'items'->0->>'id'=page->'items'->0->>'id' then raise exception 'cursor repeats';end if;
 begin perform public.network_api('publishPost',jsonb_build_object('images',jsonb_build_array(adult::text||'/missing.webp'),'text','bad'));raise exception 'forged image accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',teen::text,true);
 begin perform public.network_api('updatePost',jsonb_build_object('id',p->>'id','text','hijacked'));raise exception 'post ownership missing';exception when insufficient_privilege then null;end;
 perform public.network_api('setLike',jsonb_build_object('postId',p->>'id','liked',true));perform public.network_api('setLike',jsonb_build_object('postId',p->>'id','liked',true));
 if (public.network_api('getPost',jsonb_build_object('id',p->>'id'))->>'likeCount')::int<>1 then raise exception 'like duplicated';end if;
 c:=public.network_api('addComment',jsonb_build_object('postId',p->>'id','text','Nice'));
 comments:=public.network_api('getComments',jsonb_build_object('postId',p->>'id'));if jsonb_array_length(comments)<>1 then raise exception 'comment missing';end if;
 perform public.network_api('deleteComment',jsonb_build_object('id',c->>'id'));
 perform set_config('request.jwt.claim.sub',adult::text,true);
 begin perform public.network_api('requestConversation',jsonb_build_object('memberId',teen,'text','Hi','idempotencyKey','intro0001'));raise exception 'teen unsolicited request allowed';exception when insufficient_privilege then null;end;
 perform public.network_api('setFollow',jsonb_build_object('memberId',teen,'following',true));
 perform set_config('request.jwt.claim.sub',teen::text,true);perform public.network_api('setFollow',jsonb_build_object('memberId',adult,'following',true));
 perform set_config('request.jwt.claim.sub',adult::text,true);c:=public.network_api('requestConversation',jsonb_build_object('memberId',teen,'text','Hi','idempotencyKey','intro0001'));
 if public.network_api('requestConversation',jsonb_build_object('memberId',teen,'text','Hi','idempotencyKey','intro0001'))->>'id'<>c->>'id' then raise exception 'intro not idempotent';end if;
 begin perform public.network_api('sendMessage',jsonb_build_object('conversationId',c->>'id','text','Again','idempotencyKey','message01'));raise exception 'second intro allowed';exception when insufficient_privilege then null;end;
 begin perform public.network_api('respondConversation',jsonb_build_object('id',c->>'id','accept',true));raise exception 'sender accepted own request';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',teen::text,true);perform public.network_api('respondConversation',jsonb_build_object('id',c->>'id','accept',true));
 perform set_config('request.jwt.claim.sub',adult::text,true);msg:=public.network_api('sendMessage',jsonb_build_object('conversationId',c->>'id','text','Thanks','idempotencyKey','message01'));
 if public.network_api('sendMessage',jsonb_build_object('conversationId',c->>'id','text','Thanks','idempotencyKey','message01'))->>'id'<>msg->>'id' then raise exception 'message not idempotent';end if;
 perform set_config('request.jwt.claim.sub',teen::text,true);
 if (public.network_api('getUnreadCounts')->>'messages')::int<>2 then raise exception 'unread incorrect';end if;
 perform public.network_api('markConversationRead',jsonb_build_object('id',c->>'id'));
 if (public.network_api('getUnreadCounts')->>'messages')::int<>0 then raise exception 'mark read incorrect';end if;
 perform set_config('request.jwt.claim.sub',other::text,true);
 begin perform public.network_api('getMessages',jsonb_build_object('conversationId',c->>'id'));raise exception 'message privacy broken';exception when insufficient_privilege then null;end;
 c:=public.network_api('requestConversation',jsonb_build_object('memberId',adult,'text','Hello','idempotencyKey','intro0002'));
 perform set_config('request.jwt.claim.sub',adult::text,true);perform public.network_api('respondConversation',jsonb_build_object('id',c->>'id','accept',false));
 perform set_config('request.jwt.claim.sub',other::text,true);begin perform public.network_api('requestConversation',jsonb_build_object('memberId',adult,'text','Retry','idempotencyKey','intro0003'));raise exception 'decline retry allowed';exception when insufficient_privilege then null;end;
 perform public.network_api('report',jsonb_build_object('targetType','post','targetId',p->>'id','reason','Spam'));
 begin perform public.network_api('getReports');raise exception 'nonstaff reports exposed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',staff::text,true);r:=public.network_api('getReports')->0;
 perform public.network_api('moderate',jsonb_build_object('targetType','post','targetId',p->>'id','action','remove','reason','Spam'));
 if public.network_api('getPost',jsonb_build_object('id',p->>'id')) is not null then raise exception 'moderated post visible';end if;
 perform public.network_api('moderate',jsonb_build_object('targetType','post','targetId',p->>'id','action','restore','reason','Restored'));
 perform set_config('request.jwt.claim.sub',adult::text,true);perform public.network_api('setBlock',jsonb_build_object('memberId',teen,'blocked',true));
 if jsonb_array_length(public.network_api('getBlockedMembers'))<>1 then raise exception 'blocked list missing';end if;
 perform set_config('request.jwt.claim.sub',teen::text,true);
 if public.network_api('getPost',jsonb_build_object('id',p->>'id')) is not null then raise exception 'blocked post visible';end if;
 if jsonb_array_length(public.network_api('getConversations'))<>0 then raise exception 'blocked conversation visible';end if;
 perform set_config('request.jwt.claim.sub',adult::text,true);perform public.network_api('deleteAccountData');
 if public.network_api('joinNetwork','{"dateOfBirth":"1990-01-01"}')->>'status'<>'suspended' then raise exception 'cleanup bypasses suspension';end if;
 perform set_config('request.jwt.claim.sub',teen::text,true);
 begin perform public.network_api('moderate',jsonb_build_object('targetType','post','targetId',p->>'id','action','resolve','reason','Closed','reportId',r->>'id'));raise exception 'nonstaff resolution permitted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',staff::text,true);if jsonb_array_length(public.network_api('getReports'))<>1 then raise exception 'evidence erased';end if;
 begin perform public.network_api('moderate',jsonb_build_object('targetType','member','targetId',p->>'id','action','resolve','reason','Closed','reportId',r->>'id'));raise exception 'mismatched report resolution permitted';exception when invalid_parameter_value then null;end;
 begin perform public.network_api('moderate',jsonb_build_object('targetType','post','targetId',p->>'id','action','resolve','reason','Closed'));raise exception 'resolution without report permitted';exception when invalid_parameter_value then null;end;
 perform public.network_api('moderate',jsonb_build_object('targetType','post','targetId',p->>'id','action','resolve','reason','Account deleted; reviewed','reportId',r->>'id'));
 if (public.network_api('getReports')->0->>'resolvedAt') is null then raise exception 'deleted target report unresolved';end if;

end $$;
reset role;
do $$ declare paths text[];begin
 paths:=public.prepare_network_media_cleanup('10000000-0000-0000-0000-000000000001');
 if cardinality(paths)<>1 then raise exception 'report image not retained';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 if public.roster_can_read_media(paths[1]) then raise exception 'former owner can read restricted evidence';end if;
 if cardinality(public.expired_network_evidence_media())<>0 then raise exception 'unexpired image scheduled for deletion';end if;
 update roster_network.reports set resolved_at=now()-interval '91 days';
 if cardinality(public.expired_network_evidence_media())<>1 then raise exception 'expired image not scheduled for deletion';end if;
 perform public.prune_network_report_evidence();
 if exists(select 1 from roster_network.reports) then raise exception 'expired report evidence not pruned';end if;
 if not exists(select 1 from roster_network.audit where input->>'action'='resolve') then raise exception 'resolution audit missing';end if;
end $$;
rollback;
