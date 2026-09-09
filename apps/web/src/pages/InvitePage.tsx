import { useMutation } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorNotice } from '../components/Ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

export function InvitePage(){const{token}=useParams();const{user,loading}=useAuth();const navigate=useNavigate();const accept=useMutation({mutationFn:()=>api<{projetoId:number}>(`/convites/${token}/aceitar`,{method:'POST'}),onSuccess:result=>navigate(`/app/projetos/${result.projetoId}`)});if(loading)return <div className="route-loading"><span/></div>;if(!user){navigate(`/login?retorno=${encodeURIComponent(`/convites/${token}`)}`,{replace:true});return null}return <main className="invite-page"><section><a className="brand dark" href="/"><span className="brand-mark">M</span><span>MinhaObra</span></a><CheckCircle2 className="invite-icon"/><span>CONVITE DE PROJETO</span><h1>Você foi convidado para acompanhar uma obra.</h1><p>O convite só será aceito se o e-mail da sua conta Google corresponder ao destinatário informado pelo proprietário.</p>{accept.error&&<ErrorNotice message={accept.error.message}/>}<button className="app-button primary" disabled={accept.isPending} onClick={()=>accept.mutate()}>{accept.isPending?'Validando convite…':'Aceitar e acessar'}<ArrowRight/></button></section></main>}
