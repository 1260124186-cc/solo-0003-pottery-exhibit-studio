import {computed} from 'vue';
import {useExhibitService} from '../services/exhibitService';
export function useExhibitionFlow(){
  const svc=useExhibitService();
  const totalPieces=computed(()=>svc.state.value.exhibitions.reduce((n,e)=>n+e.pieces.length,0));
  return{...svc,totalPieces};
}
