-- Private social data. No direct table access: every operation runs through an
-- identity-bound transactional RPC. DOB never appears in a returned projection.
create schema if not exists roster_network;
revoke all on schema roster_network from public, anon, authenticated;
create table roster_network.members (id uuid primary key references public.profiles(id) on delete cascade, dob date not null, status text not null default 'active' check(status in ('active','suspended')), joined_at timestamptz not null default now());
create table roster_network.posts (id uuid primary key default gen_random_uuid(), author_id uuid not null references roster_network.members on delete cascade, text text not null check(length(text)<=2000), images text[] not null default '{}', film_url text, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), removed boolean not null default false, check(cardinality(images)<=4), check(cardinality(images)=0 or film_url is null), check(length(trim(text))>0 or cardinality(images)>0 or film_url is not null));
create table roster_network.comments(id uuid primary key default gen_random_uuid(), post_id uuid not null references roster_network.posts on delete cascade, author_id uuid not null references roster_network.members on delete cascade, text text not null check(length(trim(text)) between 1 and 2000), created_at timestamptz not null default clock_timestamp(), removed boolean not null default false);
create table roster_network.likes(post_id uuid references roster_network.posts on delete cascade, member_id uuid references roster_network.members on delete cascade, primary key(post_id,member_id));
create table roster_network.follows(source uuid references roster_network.members on delete cascade, target uuid references roster_network.members on delete cascade, primary key(source,target), check(source<>target));
create table roster_network.blocks(source uuid references roster_network.members on delete cascade, target uuid references roster_network.members on delete cascade, primary key(source,target), check(source<>target));
create table roster_network.conversations(id uuid primary key default gen_random_uuid(), sender_id uuid not null references roster_network.members on delete cascade, recipient_id uuid not null references roster_network.members on delete cascade, status text not null default 'pending' check(status in ('pending','accepted','declined')), created_at timestamptz not null default clock_timestamp(), sender_read timestamptz, recipient_read timestamptz, check(sender_id<>recipient_id));
create unique index network_conversation_pair on roster_network.conversations(least(sender_id,recipient_id),greatest(sender_id,recipient_id));
create table roster_network.messages(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references roster_network.conversations on delete cascade, sender_id uuid not null references roster_network.members on delete cascade, text text not null check(length(trim(text)) between 1 and 2000), request_key text not null, created_at timestamptz not null default clock_timestamp(), removed boolean not null default false, unique(sender_id,request_key));
create table roster_network.notifications(id uuid primary key default gen_random_uuid(), recipient_id uuid not null references roster_network.members on delete cascade, actor_id uuid not null references roster_network.members on delete cascade, kind text not null, target_id uuid not null, created_at timestamptz not null default clock_timestamp(), read boolean not null default false);
-- Evidence deliberately has no cascading identity/content foreign keys. Account
-- deletion must not erase reports. Resolved evidence expires after 90 days.
create table roster_network.reports(id uuid primary key default gen_random_uuid(), reporter_id uuid not null, target_type text not null check(target_type in('post','comment','message','member')), target_id uuid not null, reason text not null, evidence jsonb not null, created_at timestamptz not null default clock_timestamp(), resolved_at timestamptz);
create table roster_network.verification_reads(member_id uuid references roster_network.members on delete cascade,notification_id text,primary key(member_id,notification_id));
create table roster_network.retained_media(path text primary key,former_owner uuid not null,retained_at timestamptz not null default now());
create table roster_network.audit(id uuid primary key default gen_random_uuid(), actor_id uuid not null, input jsonb not null, created_at timestamptz not null default clock_timestamp());
create index network_feed_order on roster_network.posts(created_at desc,id desc) where not removed;
create index network_comments_post on roster_network.comments(post_id,created_at);
create index network_messages_conversation on roster_network.messages(conversation_id,created_at);
create index network_notifications_recipient on roster_network.notifications(recipient_id,created_at desc);
do $$ declare t text; begin foreach t in array array['members','posts','comments','likes','follows','blocks','conversations','messages','notifications','reports','audit','verification_reads','retained_media'] loop execute format('alter table roster_network.%I enable row level security',t); execute format('revoke all on roster_network.%I from public, anon, authenticated',t); end loop; end $$;
create function roster_network.visible(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from roster_network.members m where m.id=$1 and m.status='active') and not exists(select 1 from roster_network.blocks b where (b.source=auth.uid() and b.target=$1) or (b.target=auth.uid() and b.source=$1)) $$;
create function roster_network.summary(target uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('id',p.id,'handle',p.handle,'name',p.display_name,'avatar',p.avatar_url,'role',p.account_kind,'sport',p.primary_sport) from public.profiles p where p.id=target $$;
create function roster_network.post_json(target uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('id',p.id,'author',roster_network.summary(p.author_id),'text',p.text,'images',p.images,'filmUrl',p.film_url,'createdAt',p.created_at,'updatedAt',p.updated_at,'liked',exists(select 1 from roster_network.likes l where l.post_id=p.id and l.member_id=auth.uid()),'likeCount',(select count(*) from roster_network.likes l where l.post_id=p.id and roster_network.visible(l.member_id)),'commentCount',(select count(*) from roster_network.comments c where c.post_id=p.id and not c.removed and roster_network.visible(c.author_id))) from roster_network.posts p where p.id=target and not p.removed and roster_network.visible(p.author_id) $$;
create function roster_network.message_json(target uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('id',m.id,'conversationId',m.conversation_id,'senderId',m.sender_id,'text',m.text,'createdAt',m.created_at) from roster_network.messages m where m.id=target and not m.removed $$;
create function roster_network.conversation_json(target uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('id',c.id,'member',roster_network.summary(case when c.sender_id=auth.uid() then c.recipient_id else c.sender_id end),'status',c.status,'incoming',c.recipient_id=auth.uid(),'unreadCount',(select count(*) from roster_network.messages m where m.conversation_id=c.id and not m.removed and m.sender_id<>auth.uid() and m.created_at>coalesce(case when c.sender_id=auth.uid() then c.sender_read else c.recipient_read end,'-infinity'::timestamptz)),'lastMessage',(select roster_network.message_json(m.id) from roster_network.messages m where m.conversation_id=c.id and not m.removed order by m.created_at desc,m.id desc limit 1),'createdAt',c.created_at) from roster_network.conversations c where c.id=target and auth.uid() in(c.sender_id,c.recipient_id) and roster_network.visible(case when c.sender_id=auth.uid() then c.recipient_id else c.sender_id end) $$;
create function roster_network.can_message(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select $1<>auth.uid() and roster_network.visible($1) and exists(select 1 from roster_network.members m where m.id=$1 and (m.dob<=current_date-interval '18 years' or (exists(select 1 from roster_network.follows f where f.source=$1 and f.target=auth.uid()) and exists(select 1 from roster_network.follows f where f.source=auth.uid() and f.target=m.id)))) and not exists(select 1 from roster_network.conversations c where auth.uid() in(c.sender_id,c.recipient_id) and $1 in(c.sender_id,c.recipient_id) and c.status='declined') $$;
create function roster_network.notify(recipient uuid,kind text,target uuid) returns void language sql security definer set search_path='' as $$ insert into roster_network.notifications(recipient_id,actor_id,kind,target_id) select recipient,auth.uid(),kind,target where recipient<>auth.uid() $$;

create function roster_network.verification_notifications() returns jsonb language sql stable security definer set search_path='' as $$
 with events as (
  select r.id,r.profile_id as other_id,'verification_request'::text as kind,r.created_at as event_at
  from public.verification_requests r join auth.users u on lower(u.email)=lower(r.recipient_email::text) join public.profiles p on p.id=u.id
  where u.id=auth.uid() and u.email_confirmed_at is not null and p.account_kind='coach' and r.status='pending' and r.expires_at>now()
  union all
  select r.id,(select u.id from auth.users u where lower(u.email)=lower(r.recipient_email::text) limit 1),'verification_'||r.status,coalesce(r.responded_at,r.created_at)
  from public.verification_requests r where r.profile_id=auth.uid() and r.status in('verified','disputed')
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',e.kind||':'||e.id,'kind',e.kind,'targetId',e.id,'href','/verify/'||e.id,'createdAt',e.event_at,'read',exists(select 1 from roster_network.verification_reads v where v.member_id=auth.uid() and v.notification_id=e.kind||':'||e.id),'actor',case when roster_network.visible(e.other_id) then roster_network.summary(e.other_id) else jsonb_build_object('id','roster','handle','','name','Roster verification','avatar',null,'role','system','sport',null) end)),'[]') from events e
 where not exists(select 1 from roster_network.blocks b where (b.source=auth.uid() and b.target=e.other_id) or(b.target=auth.uid() and b.source=e.other_id))
$$;

create function public.network_api(operation text,payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid(); target uuid; post_id uuid; member_id uuid; content text; v_request_key text; dob date; images text[]; film text; p roster_network.posts; c roster_network.conversations; msg roster_network.messages; cm roster_network.comments; m roster_network.members; result jsonb; evidence jsonb; items jsonb; row_count integer; page_limit integer; staff boolean; cutoff text;
begin
 if actor is null or not exists(select 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null) then raise exception 'Sign in with a confirmed email.' using errcode='42501'; end if;
 select exists(select 1 from public.profiles where id=actor and account_kind='staff') into staff;
 if operation='isModerator' then return to_jsonb(staff); end if;
 if operation='getMembership' then select jsonb_build_object('status',status,'joinedAt',joined_at) into result from roster_network.members where id=actor; return result; end if;
 -- Serialize all writes, including relationship/request races and moderation.
 -- Readers retain normal MVCC snapshots. This can be sharded if write load grows.
 if operation not in('getFeed','getPost','getComments','discover','getMember','getConversations','getMessages','getNotifications','getUnreadCounts','getReports','canReadMedia','getBlockedMembers') then perform pg_advisory_xact_lock(745892134); delete from roster_network.reports where resolved_at<now()-interval '90 days'; end if;
 if operation='joinNetwork' then
  begin dob:=(payload->>'dateOfBirth')::date; exception when others then raise exception 'Enter a valid date of birth.' using errcode='22023'; end;
  if dob is null or dob>current_date-interval '13 years' or dob<current_date-interval '120 years' then raise exception 'Members must be at least 13.' using errcode='22023'; end if;
  select * into m from roster_network.members where id=actor;
  if found and m.dob<>dob then raise exception 'Date of birth cannot be changed.' using errcode='42501'; end if;
  insert into roster_network.members(id,dob) values(actor,dob) on conflict(id) do nothing;
  return public.network_api('getMembership');
 end if;
 if operation='deleteAccountData' then
  -- Keep the immutable DOB/suspension marker until actual auth-account deletion;
  -- otherwise a member could erase their suspension and rejoin immediately.
  delete from roster_network.posts where author_id=actor;
  delete from roster_network.comments where author_id=actor;
  delete from roster_network.likes where member_id=actor;
  delete from roster_network.verification_reads where member_id=actor;
  delete from roster_network.follows where source=actor or target=actor;
  delete from roster_network.blocks where source=actor or target=actor;
  delete from roster_network.conversations where sender_id=actor or recipient_id=actor;
  delete from roster_network.notifications where actor_id=actor or recipient_id=actor;
  update roster_network.members set status='suspended' where id=actor;
  return null;
 end if;
 if not exists(select 1 from roster_network.members where id=actor and status='active') then raise exception 'Join the network to continue.' using errcode='42501'; end if;
 if operation in('getReports','moderate') and not staff then raise exception 'Staff access required.' using errcode='42501'; end if;
 target:=nullif(payload->>'id','')::uuid; member_id:=nullif(payload->>'memberId','')::uuid; post_id:=nullif(payload->>'postId','')::uuid;
 if operation='canReadMedia' then return to_jsonb(exists(select 1 from roster_network.posts p where not p.removed and roster_network.visible(p.author_id) and (payload->>'path')=any(p.images)) or exists(select 1 from public.profiles p where roster_network.visible(p.id) and ('/api/media/'||(payload->>'path'))=p.avatar_url)); end if;
 if operation='getPost' then return roster_network.post_json(target); end if;
 if operation='getFeed' then
  page_limit:=least(50,greatest(1,coalesce((payload->>'limit')::int,20))); cutoff:=payload->>'cursor';
  select coalesce(jsonb_agg(roster_network.post_json(q.id) order by q.created_at desc,q.id desc),'[]') into items from (select p.* from roster_network.posts p where not p.removed and roster_network.visible(p.author_id) and (member_id is null or p.author_id=member_id) and (coalesce(payload->>'mode','explore')<>'following' or p.author_id=actor or exists(select 1 from roster_network.follows f where f.source=actor and f.target=p.author_id)) and (cutoff is null or (p.created_at,p.id)<(split_part(cutoff,'|',1)::timestamptz,split_part(cutoff,'|',2)::uuid)) order by p.created_at desc,p.id desc limit page_limit+1) q;
  if jsonb_array_length(items)>page_limit then items:=items-(jsonb_array_length(items)-1); result:=jsonb_build_object('items',items,'nextCursor',(items->(page_limit-1)->>'createdAt')||'|'||(items->(page_limit-1)->>'id')); else result:=jsonb_build_object('items',items,'nextCursor',null); end if; return result;
 end if;
 if operation in('publishPost','updatePost') then
  content:=trim(coalesce(payload->>'text','')); select coalesce(array_agg(value),'{}') into images from jsonb_array_elements_text(coalesce(payload->'images','[]')); film:=nullif(trim(payload->>'filmUrl'),'');
  if length(content)>2000 or (content='' and cardinality(images)=0 and film is null) or cardinality(images)>4 or (cardinality(images)>0 and film is not null) then raise exception 'Add a valid post with up to 2,000 characters and four images or one film link.' using errcode='22023'; end if;
  if exists(select 1 from unnest(images) i where i not like actor::text||'/%' or i !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$' or not exists(select 1 from storage.objects o where o.bucket_id='roster-media' and o.name=i and o.owner_id=actor::text)) then raise exception 'Image upload is not authorized.' using errcode='42501'; end if;
  if film is not null and film !~ '^https://(www\.)?(youtube\.com|youtu\.be|vimeo\.com|hudl\.com)/[^[:space:]]+$' then raise exception 'Use a supported HTTPS film link.' using errcode='22023'; end if;
  if operation='publishPost' then insert into roster_network.posts(author_id,text,images,film_url) values(actor,content,images,film) returning id into target; else update roster_network.posts set text=content,images=images,film_url=film,updated_at=clock_timestamp() where id=target and author_id=actor and not removed; if not found then raise exception 'Post unavailable.' using errcode='42501'; end if; end if; return roster_network.post_json(target);
 end if;
 if operation='deletePost' then update roster_network.posts set removed=true where id=target and author_id=actor; if not found then raise exception 'Post unavailable.' using errcode='42501'; end if; return null; end if;
 if operation in('getComments','addComment','setLike') then
  select * into p from roster_network.posts where id=post_id and not removed and roster_network.visible(author_id); if not found then raise exception 'Post unavailable.' using errcode='42501'; end if;
  if operation='getComments' then select coalesce(jsonb_agg(jsonb_build_object('id',id,'postId',post_id,'author',roster_network.summary(author_id),'text',text,'createdAt',created_at) order by created_at,id),'[]') into result from roster_network.comments c where c.post_id=p.id and not removed and roster_network.visible(author_id); return result; end if;
  if operation='setLike' then if coalesce((payload->>'liked')::boolean,false) then insert into roster_network.likes values(p.id,actor) on conflict do nothing; get diagnostics row_count=row_count; if row_count>0 then perform roster_network.notify(p.author_id,'like',p.id); end if; else delete from roster_network.likes l where l.post_id=p.id and l.member_id=actor; end if; return null; end if;
  content:=trim(payload->>'text'); if content is null or length(content) not between 1 and 2000 then raise exception 'Enter between 1 and 2,000 characters.' using errcode='22023'; end if;
  insert into roster_network.comments(post_id,author_id,text) values(p.id,actor,content) returning * into cm; perform roster_network.notify(p.author_id,'comment',p.id); return jsonb_build_object('id',cm.id,'postId',cm.post_id,'author',roster_network.summary(actor),'text',cm.text,'createdAt',cm.created_at);
 end if;
 if operation='deleteComment' then update roster_network.comments set removed=true where id=target and author_id=actor; if not found then raise exception 'Comment unavailable.' using errcode='42501'; end if; return null; end if;
 if operation='discover' then select coalesce(jsonb_agg(roster_network.summary(q.id)),'[]') into result from(select p.id from public.profiles p where roster_network.visible(p.id) and concat_ws(' ',p.display_name,p.handle,p.primary_sport) ilike '%'||coalesce(payload->>'query','')||'%' order by p.display_name,p.id limit 50) q; return result; end if;
 if operation='getMember' then select p.id into member_id from public.profiles p where p.handle=payload->>'handle' and roster_network.visible(p.id); if member_id is null then return null; end if; return roster_network.summary(member_id)||jsonb_build_object('publicResumeUrl',(select case when visibility='public' then '/'||handle else null end from public.profiles where id=member_id),'following',exists(select 1 from roster_network.follows f where f.source=actor and f.target=member_id),'followerCount',(select count(*) from roster_network.follows f where f.target=member_id and roster_network.visible(f.source)),'followingCount',(select count(*) from roster_network.follows f where f.source=member_id and roster_network.visible(f.target)),'canMessage',roster_network.can_message(member_id)); end if;
 if operation='getBlockedMembers' then select coalesce(jsonb_agg(roster_network.summary(b.target)),'[]') into result from roster_network.blocks b where b.source=actor;return result;end if;
 if operation in('setFollow','setBlock') then
  if member_id=actor or not exists(select 1 from roster_network.members where id=member_id) then raise exception 'Member unavailable.' using errcode='42501'; end if;
  if operation='setFollow' then if not roster_network.visible(member_id) then raise exception 'Member unavailable.' using errcode='42501'; end if; if coalesce((payload->>'following')::boolean,false) then insert into roster_network.follows values(actor,member_id) on conflict do nothing; get diagnostics row_count=row_count; if row_count>0 then perform roster_network.notify(member_id,'follow',actor); end if; else delete from roster_network.follows where source=actor and target=member_id; end if;
  else if coalesce((payload->>'blocked')::boolean,false) then insert into roster_network.blocks values(actor,member_id) on conflict do nothing; delete from roster_network.follows where (source=actor and target=member_id) or(source=member_id and target=actor); else delete from roster_network.blocks where source=actor and target=member_id; end if; end if; return null;
 end if;
 if operation='getConversations' then select coalesce(jsonb_agg(roster_network.conversation_json(c.id) order by coalesce((select max(created_at) from roster_network.messages where conversation_id=c.id),c.created_at) desc),'[]') into result from roster_network.conversations c where actor in(c.sender_id,c.recipient_id) and roster_network.visible(case when c.sender_id=actor then c.recipient_id else c.sender_id end); return result; end if;
 if operation in('requestConversation','sendMessage') then content:=trim(payload->>'text');v_request_key:=payload->>'idempotencyKey';if content is null or length(content) not between 1 and 2000 or v_request_key is null or v_request_key !~ '^[A-Za-z0-9_-]{8,128}$' then raise exception 'Enter a valid message and request key.' using errcode='22023';end if; end if;
 if operation='requestConversation' then
  if not roster_network.can_message(member_id) then raise exception 'Messaging is unavailable for this member.' using errcode='42501'; end if;
  select * into c from roster_network.conversations where actor in(sender_id,recipient_id) and member_id in(sender_id,recipient_id);
  if found then if exists(select 1 from roster_network.messages m where m.sender_id=actor and m.request_key=v_request_key and m.conversation_id=c.id and m.text=content) then return roster_network.conversation_json(c.id); end if; raise exception 'A conversation already exists.' using errcode='23505'; end if;
  insert into roster_network.conversations(sender_id,recipient_id) values(actor,member_id) returning * into c;
  insert into roster_network.messages(conversation_id,sender_id,text,request_key) values(c.id,actor,content,v_request_key);perform roster_network.notify(member_id,'request',c.id);return roster_network.conversation_json(c.id);
 end if;
 if operation in('respondConversation','getMessages','sendMessage','markConversationRead') then
  target:=coalesce(nullif(payload->>'conversationId','')::uuid,target);select * into c from roster_network.conversations where id=target and actor in(sender_id,recipient_id);if not found or not roster_network.visible(case when c.sender_id=actor then c.recipient_id else c.sender_id end) then raise exception 'Conversation unavailable.' using errcode='42501';end if;
  if operation='respondConversation' then if c.recipient_id<>actor or c.status<>'pending' then raise exception 'Only the recipient can respond to a pending request.' using errcode='42501';end if;update roster_network.conversations set status=case when (payload->>'accept')::boolean then 'accepted' else 'declined' end where id=c.id;return null;end if;
  if operation='getMessages' then select coalesce(jsonb_agg(roster_network.message_json(m.id) order by m.created_at,m.id),'[]') into result from roster_network.messages m where m.conversation_id=c.id and not removed;return result;end if;
  if operation='markConversationRead' then update roster_network.conversations set sender_read=case when sender_id=actor then clock_timestamp() else sender_read end,recipient_read=case when recipient_id=actor then clock_timestamp() else recipient_read end where id=c.id;return null;end if;
  if c.status<>'accepted' then raise exception 'Wait for the recipient to accept your request.' using errcode='42501';end if;
  select * into msg from roster_network.messages m where m.sender_id=actor and m.request_key=v_request_key;if found then if msg.conversation_id<>c.id or msg.text<>content then raise exception 'Request key already used.' using errcode='23505';end if;return roster_network.message_json(msg.id);end if;
  insert into roster_network.messages(conversation_id,sender_id,text,request_key) values(c.id,actor,content,v_request_key) returning * into msg;perform roster_network.notify(case when c.sender_id=actor then c.recipient_id else c.sender_id end,'message',c.id);return roster_network.message_json(msg.id);
 end if;
 if operation='getNotifications' then
  select coalesce(jsonb_agg(q.item order by q.item->>'createdAt' desc),'[]') into result from (
   select items.item from (
    select jsonb_build_object('id',n.id,'kind',n.kind,'actor',roster_network.summary(n.actor_id),'targetId',n.target_id,'createdAt',n.created_at,'read',n.read) as item from roster_network.notifications n where n.recipient_id=actor and roster_network.visible(n.actor_id)
    union all select value from jsonb_array_elements(roster_network.verification_notifications())
   ) items order by items.item->>'createdAt' desc limit 100
  ) q;return result;
 end if;
 if operation='markNotificationsRead' then update roster_network.notifications set read=true where recipient_id=actor;insert into roster_network.verification_reads(member_id,notification_id) select actor,value->>'id' from jsonb_array_elements(roster_network.verification_notifications()) on conflict do nothing;return null;end if;
 if operation='getUnreadCounts' then return jsonb_build_object('messages',(select coalesce(sum((value->>'unreadCount')::int),0) from jsonb_array_elements(public.network_api('getConversations'))),'notifications',(select count(*) from jsonb_array_elements(public.network_api('getNotifications')) where not (value->>'read')::boolean));end if;
 if operation='report' then
  target:=(payload->>'targetId')::uuid; content:=trim(payload->>'reason');if content is null or length(content) not between 1 and 2000 then raise exception 'Enter a report reason.' using errcode='22023';end if;
  case payload->>'targetType'
   when 'post' then evidence:=roster_network.post_json(target);
   when 'comment' then select to_jsonb(cm) into evidence from roster_network.comments cm where cm.id=target and not cm.removed and roster_network.visible(cm.author_id) and roster_network.post_json(cm.post_id) is not null;
   when 'message' then select roster_network.message_json(msg.id) into evidence from roster_network.messages msg where msg.id=target and roster_network.conversation_json(msg.conversation_id) is not null;
   when 'member' then if roster_network.visible(target) then evidence:=roster_network.summary(target);end if;
   else raise exception 'Invalid report target.' using errcode='22023';end case;
  if evidence is null then raise exception 'Report target unavailable.' using errcode='42501';end if;
  insert into roster_network.reports(reporter_id,target_type,target_id,reason,evidence) values(actor,payload->>'targetType',target,content,evidence);return null;
 end if;
 if operation='getReports' then select coalesce(jsonb_agg(jsonb_build_object('id',id,'reporterId',reporter_id,'targetType',target_type,'targetId',target_id,'reason',reason,'evidence',evidence,'createdAt',created_at,'resolvedAt',resolved_at) order by created_at desc),'[]') into result from roster_network.reports where resolved_at is null or resolved_at>now()-interval '90 days';return result;end if;
 if operation='moderate' then
  target:=(payload->>'targetId')::uuid;content:=trim(payload->>'reason');if content is null or length(content) not between 1 and 2000 or coalesce(payload->>'action','') not in('remove','restore','resolve') then raise exception 'Enter a valid moderation action and reason.' using errcode='22023';end if;
  if payload->>'action'='resolve' then
   if payload->>'reportId' is null then raise exception 'Choose a report to resolve.' using errcode='22023';end if;
  else
  case payload->>'targetType'
   when 'member' then if target=actor then raise exception 'Cannot suspend yourself.' using errcode='42501';end if;update roster_network.members set status=case when payload->>'action'='remove' then 'suspended' else 'active' end where id=target;
   when 'post' then update roster_network.posts set removed=(payload->>'action'='remove') where id=target;
   when 'comment' then update roster_network.comments set removed=(payload->>'action'='remove') where id=target;
   when 'message' then update roster_network.messages set removed=(payload->>'action'='remove') where id=target;
   else raise exception 'Invalid target type.' using errcode='22023';end case;
  if not found then raise exception 'Moderation target unavailable.' using errcode='22023';end if;
  end if;
  if payload->>'reportId' is not null then update roster_network.reports set resolved_at=coalesce(resolved_at,now()) where id=(payload->>'reportId')::uuid and target_id=target and target_type=payload->>'targetType';if not found then raise exception 'Report does not match target.' using errcode='22023';end if;end if;
  insert into roster_network.audit(actor_id,input) values(actor,payload);delete from roster_network.reports where resolved_at<now()-interval '90 days';return null;
 end if;
 raise exception 'Unknown network operation.' using errcode='22023';
end $$;
revoke all on all functions in schema roster_network from public,anon,authenticated;
revoke all on function public.network_api(text,jsonb) from public,anon;
grant execute on function public.network_api(text,jsonb) to authenticated;
-- Private bucket and authenticated owner writes. Reads share the same social
-- eligibility rules; public/unlisted resumes expose only their exact artwork.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('roster-media','roster-media',false,10485760,array['image/webp']) on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/webp'];
create function public.roster_can_read_media(object_name text) returns boolean language sql stable security definer set search_path='' as $$ select not exists(select 1 from roster_network.retained_media r where r.path=object_name) and (exists(select 1 from public.profiles p where split_part(object_name,'/',1)=p.id::text and ('/api/media/'||object_name) in(p.avatar_url,p.cover_url) and ((p.visibility in('public','unlisted') and p.suspended_at is null) or p.id=auth.uid())) or (auth.uid() is not null and split_part(object_name,'/',1)=auth.uid()::text) or (exists(select 1 from auth.users u join roster_network.members m on m.id=u.id where u.id=auth.uid() and u.email_confirmed_at is not null and m.status='active') and (exists(select 1 from roster_network.posts p where not p.removed and roster_network.visible(p.author_id) and object_name=any(p.images)) or exists(select 1 from public.profiles p where roster_network.visible(p.id) and ('/api/media/'||object_name)=p.avatar_url)))) $$;
revoke all on function public.roster_can_read_media(text) from public;grant execute on function public.roster_can_read_media(text) to anon,authenticated;
create policy roster_media_read on storage.objects for select to anon,authenticated using(bucket_id='roster-media' and public.roster_can_read_media(name));
create policy roster_media_insert on storage.objects for insert to authenticated with check(bucket_id='roster-media' and (storage.foldername(name))[1]=auth.uid()::text and name ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$');
create function public.network_media_is_evidence(object_name text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from roster_network.reports r where (r.resolved_at is null or r.resolved_at>now()-interval '90 days') and r.target_type='post' and coalesce(r.evidence->'images','[]') ? object_name) $$;
revoke all on function public.network_media_is_evidence(text) from public;grant execute on function public.network_media_is_evidence(text) to authenticated;
create policy roster_media_delete on storage.objects for delete to authenticated using(bucket_id='roster-media' and owner_id=auth.uid()::text and not public.network_media_is_evidence(name));

-- Service-only maintenance for an external scheduler. Writes also prune expiry.
create function public.prune_network_report_evidence() returns void language plpgsql security definer set search_path='' as $$ begin delete from roster_network.reports where resolved_at<now()-interval '90 days';delete from roster_network.retained_media r where not exists(select 1 from storage.objects o where o.bucket_id='roster-media' and o.name=r.path);end $$;
revoke all on function public.prune_network_report_evidence() from public,anon,authenticated;
grant execute on function public.prune_network_report_evidence() to service_role;

-- A profile owner cannot publish someone else's private post attachment by
-- assigning it as their public avatar. Enforce this even for direct REST writes.
create function public.guard_profile_media_ownership() returns trigger language plpgsql security definer set search_path='' as $$
declare artwork text; changed boolean;
begin
 foreach artwork in array array[new.avatar_url,new.cover_url] loop
  changed:=tg_op='INSERT' or (artwork is distinct from old.avatar_url and artwork is distinct from old.cover_url);
  if changed and artwork like '/api/media/%' and not exists(select 1 from storage.objects o where o.bucket_id='roster-media' and o.name=substring(artwork from 12) and o.owner_id=new.id::text and split_part(o.name,'/',1)=new.id::text) then raise exception 'Profile media must be an owned upload.' using errcode='42501';end if;
 end loop;
 return new;
end $$;
create trigger profile_media_ownership before insert or update of avatar_url,cover_url on public.profiles for each row execute function public.guard_profile_media_ownership();
revoke all on function public.guard_profile_media_ownership() from public,anon,authenticated;

-- The service account calls this before deleting ordinary account media. Keep
-- retained source objects, clear ownership, and skip returned paths in Storage
-- API removal. They have no surviving profile/post authorization after deletion.
create function public.prepare_network_media_cleanup(user_id uuid) returns text[] language plpgsql security definer set search_path='' as $$
declare retained text[];
begin
 select coalesce(array_agg(o.name),'{}') into retained from storage.objects o where o.bucket_id='roster-media' and split_part(o.name,'/',1)=user_id::text and (o.owner_id=user_id::text or exists(select 1 from roster_network.retained_media r where r.path=o.name and r.former_owner=user_id)) and public.network_media_is_evidence(o.name);
 insert into roster_network.retained_media(path,former_owner) select unnest(retained),user_id on conflict(path) do nothing;
 update storage.objects set owner_id=null where bucket_id='roster-media' and name=any(retained);
 if exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner') then execute 'update storage.objects set owner=null where bucket_id=$1 and name=any($2)' using 'roster-media',retained;end if;
 return retained;
end $$;
revoke all on function public.prepare_network_media_cleanup(uuid) from public,anon,authenticated;grant execute on function public.prepare_network_media_cleanup(uuid) to service_role;
-- Delete these returned objects through the Storage API BEFORE pruning expired
-- report rows. Only unowned retained objects qualify, never live user uploads.
create function public.expired_network_evidence_media() returns text[] language sql stable security definer set search_path='' as $$ select coalesce(array_agg(o.name),'{}') from storage.objects o join roster_network.retained_media r on r.path=o.name where o.bucket_id='roster-media' and o.owner_id is null and not public.network_media_is_evidence(o.name) $$;
revoke all on function public.expired_network_evidence_media() from public,anon,authenticated;grant execute on function public.expired_network_evidence_media() to service_role;

create index network_posts_author on roster_network.posts(author_id,created_at desc,id desc);
create index network_comments_author on roster_network.comments(author_id);
create index network_likes_member on roster_network.likes(member_id);
create index network_follow_target on roster_network.follows(target,source);
create index network_block_target on roster_network.blocks(target,source);
create index network_conversation_sender on roster_network.conversations(sender_id);
create index network_conversation_recipient on roster_network.conversations(recipient_id);
create index network_notifications_actor on roster_network.notifications(actor_id);
