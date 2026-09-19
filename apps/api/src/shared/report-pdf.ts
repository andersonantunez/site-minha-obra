import PDFDocument from 'pdfkit'
export type ReportProject={nome:string;endereco?:string|null;cep?:string|null;logradouro?:string|null;numero?:string|null;complemento?:string|null;bairro?:string|null;cidade:string|null;estado:string|null;latitude?:string|number|null;longitude?:string|number|null}
export type ReportColumn<T>={label:string;width:number;value:(row:T)=>string;align?:'left'|'center'|'right';secondary?:(row:T)=>string;badgeColor?:(row:T)=>string|undefined;badgeTextColor?:(row:T)=>string|undefined;verticalAlign?:'top'|'middle';cellBackground?:(row:T)=>string|undefined;cellTextColor?:(row:T)=>string|undefined;textColor?:(row:T)=>string|undefined;headerTextColor?:string}
export type ReportIndicator={label:string;value:string;color:string}
export function reportContrastColor(color:string){
 const value=color.replace('#','')
 if(!/^[0-9a-f]{6}$/i.test(value))return '#ffffff'
 const red=Number.parseInt(value.slice(0,2),16),green=Number.parseInt(value.slice(2,4),16),blue=Number.parseInt(value.slice(4,6),16)
 return red*0.299+green*0.587+blue*0.114>160?'#3e493f':'#ffffff'
}
export function reportTintColor(color:string,whiteWeight=0.76){
 const value=color.replace('#','')
 if(!/^[0-9a-f]{6}$/i.test(value))return '#f6f6f3'
 const mix=(start:number)=>Math.round(start+(255-start)*whiteWeight).toString(16).padStart(2,'0')
 return `#${mix(Number.parseInt(value.slice(0,2),16))}${mix(Number.parseInt(value.slice(2,4),16))}${mix(Number.parseInt(value.slice(4,6),16))}`
}
function projectAddressLines(project:ReportProject){
 const upper=(value:string)=>value.trim().toLocaleUpperCase('pt-BR')
 const street=[project.logradouro||project.endereco,project.numero,project.complemento].filter((value):value is string=>Boolean(value?.trim())).map(upper).reduce((line,part,index)=>index===0?part:`${line}${index===1?', ':'  '}${part}`,'')
 const locality=[project.bairro,[project.cidade,project.estado].filter(Boolean).join(' - ')].filter((value):value is string=>Boolean(value)).map(upper).join('  ')
 return [project.cep?`CEP ${upper(project.cep)}`:'',street,locality].filter(Boolean)
}
export function reportPdf(title:string,project:ReportProject){
 const pdf=new PDFDocument({size:'A4',layout:'landscape',margins:{top:105,right:36,bottom:30,left:36},bufferPages:true,info:{Title:`${title} - ${project.nome}`}})
 const header=()=>{
  pdf.rect(0,0,842,96).fill('#242a26')
  pdf.save().lineWidth(1).strokeColor('#ffffff').moveTo(50,23).lineTo(66,39).lineTo(50,55).lineTo(34,39).closePath().stroke().restore()
  const markFontSize=13
  pdf.font('Helvetica-Bold').fontSize(markFontSize)
  const markWidth=pdf.widthOfString('M')
  // Helvetica's uppercase glyph occupies about 76% of its line box; center the visible M, not the line box.
  pdf.fillColor('#ffffff').text('M',50-markWidth/2,39-(markFontSize*.76)/2,{lineBreak:false})
  pdf.fontSize(17).text('MinhaObra',78,30,{lineBreak:false})
  const latitude=Number(project.latitude),longitude=Number(project.longitude)
  const mapsUrl=Number.isFinite(latitude)&&Number.isFinite(longitude)?`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`:undefined
  const right=400,rightWidth=405,address=projectAddressLines(project),projectBrown='#b7834d'
  const projectFontSize=13,addressFontSize=7.2,addressLineHeight=9.5
  const projectY=(96-(projectFontSize*1.1+(address.length?4+address.length*addressLineHeight:0)))/2
  pdf.font('Helvetica-Bold').fontSize(projectFontSize).fillColor(projectBrown).text(project.nome,right,projectY,{width:rightWidth,align:'right',lineBreak:false,...(mapsUrl?{link:mapsUrl}: {})})
  pdf.font('Helvetica').fontSize(addressFontSize).fillColor(projectBrown)
  address.forEach((line,index)=>pdf.text(line,right,projectY+projectFontSize*1.25+index*addressLineHeight,{width:rightWidth,align:'right',lineBreak:false}))
  pdf.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text(`Relatório de ${title}`,36,72,{width:770})
  pdf.y=105
 }
 pdf.on('pageAdded',header);header();return pdf
}
export function finishReportPdf(pdf:PDFKit.PDFDocument){
 const range=pdf.bufferedPageRange()
 for(let i=range.start;i<range.start+range.count;i++){pdf.switchToPage(i);pdf.font('Helvetica').fontSize(7).fillColor('#737a75').text(`MinhaObra  |  Página ${i+1} de ${range.count}`,36,555,{width:770,align:'center',lineBreak:false})}
 return pdf
}
export function pdfReportIndicators(pdf:PDFKit.PDFDocument,indicators:ReportIndicator[]){
 const left=36,width=770,gap=10,height=62
 if(!indicators.length)return
 if(pdf.y+height>530)pdf.addPage()
 const cardWidth=(width-gap*(indicators.length-1))/indicators.length,y=pdf.y
 indicators.forEach((indicator,index)=>{
  const x=left+index*(cardWidth+gap),background=reportTintColor(indicator.color,.86)
  pdf.roundedRect(x,y,cardWidth,height,4).fill(background)
  pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(indicator.color).text(indicator.label,x+12,y+13,{width:cardWidth-24,align:'left',lineBreak:false})
  pdf.font('Helvetica-Bold').fontSize(12).fillColor('#303732').text(indicator.value,x+12,y+33,{width:cardWidth-24,align:'left',lineBreak:false})
 })
 pdf.y=y+height+18
}
export function pdfTable<T>(pdf:PDFKit.PDFDocument,rows:T[],columns:ReportColumn<T>[],options:{parent?:(row:T)=>boolean;keepNext?:(row:T)=>boolean;secondary?:boolean;rowBackground?:(row:T)=>string|undefined;rowTextColor?:(row:T)=>string|undefined}={}){
 const left=36,width=columns.reduce((n,c)=>n+c.width,0),bottom=530,lineHeight=11
 const tableHeader=()=>{
  const y=pdf.y
  pdf.rect(left,y,width,28).fill(options.secondary?'#efeee9':'#303732')
  let x=left
  for(const c of columns){
   pdf.font('Helvetica-Bold').fontSize(8)
   const labelHeight=pdf.heightOfString(c.label,{width:c.width-10})
   pdf.fillColor(options.secondary?'#737a75':c.headerTextColor||'#ffffff').text(c.label,x+5,y+(28-labelHeight)/2,{width:c.width-10,align:c.align||'left',lineBreak:false})
   x+=c.width
  }
  pdf.y=y+28
 }
 const wrap=(value:string,width:number,font:string,size:number)=>{
  pdf.font(font).fontSize(size)
  const lines:string[]=[]
  for(const paragraph of value.split('\n')){
   let line=''
   for(const word of paragraph.split(/\s+/)){
    const candidate=line?`${line} ${word}`:word
    if(pdf.widthOfString(candidate)>width){
     if(line)lines.push(line)
     line=word
     // Break long URLs or unbroken identifiers rather than overflowing a cell.
     while(pdf.widthOfString(line)>width){let length=line.length;while(length>1&&pdf.widthOfString(line.slice(0,length))>width)length--;lines.push(line.slice(0,length));line=line.slice(length)}
    }else line=candidate
   }
   lines.push(line)
  }
  return lines
 }
 const cells=(row:T)=>columns.map(c=>[
  ...wrap(c.value(row),c.width-10,options.parent?.(row)?'Helvetica-Bold':'Helvetica',8).map(text=>({text,secondary:false})),
  ...(c.secondary?.(row)?wrap(c.secondary(row),c.width-10,'Helvetica',7).map(text=>({text,secondary:true})):[])
 ])
 if(pdf.y+56>bottom)pdf.addPage()
 tableHeader()
 rows.forEach((row,index)=>{
  const values=cells(row),lineCount=Math.max(1,...values.map(v=>v.length)),fullHeight=Math.max(28,lineCount*lineHeight+14)
  const next=options.keepNext?.(row)&&rows[index+1]?Math.max(28,...cells(rows[index+1]!).map(v=>v.length*lineHeight+14)):0
  if(pdf.y+fullHeight+next>bottom&&pdf.y>130){pdf.addPage();tableHeader()}
  let offset=0
  while(offset<lineCount){
   const count=Math.min(lineCount-offset,Math.max(1,Math.floor((bottom-pdf.y-14)/lineHeight)))
   const h=Math.max(28,count*lineHeight+14),y=pdf.y,parent=options.parent?.(row)
   const rowBackground=options.rowBackground?.(row)
   pdf.rect(left,y,width,h).fill(rowBackground||(parent?'#eae6df':index%2?'#f6f6f3':'#ffffff'))
   let x=left
   columns.forEach((c,ci)=>{
    const cellBackground=c.cellBackground?.(row)
    if(cellBackground)pdf.rect(x,y,c.width,h).fill(cellBackground)
    const badgeColor=c.badgeColor?.(row)
    const visibleLines=values[ci]!.slice(offset,offset+count)
    const textHeight=Math.max(lineHeight,visibleLines.length*lineHeight)
    const badgeHeight=badgeColor?Math.min(h-12,Math.max(22,textHeight+10)):0
    const badgeY=badgeColor?y+(h-badgeHeight)/2:0
    if(badgeColor)pdf.roundedRect(x+8,badgeY,c.width-16,badgeHeight,3).fill(badgeColor)
    const textY=badgeColor?badgeY+(badgeHeight-textHeight)/2:c.verticalAlign==='middle'?y+(h-textHeight)/2:y+7
    visibleLines.forEach((line,li)=>{
     const color=c.textColor?.(row)||(cellBackground?c.cellTextColor?.(row)||reportContrastColor(cellBackground):rowBackground?options.rowTextColor?.(row)||reportContrastColor(rowBackground):badgeColor&&!line.secondary?c.badgeTextColor?.(row)||reportContrastColor(badgeColor):line.secondary?'#737a75':'#303732')
     pdf.font(parent&&!line.secondary?'Helvetica-Bold':'Helvetica').fontSize(line.secondary?7:8).fillColor(color).text(line.text,x+5,textY+li*lineHeight,{width:c.width-10,align:c.align||'left',lineBreak:false})
    })
    x+=c.width
   })
   pdf.y=y+h;offset+=count
   if(offset<lineCount){pdf.addPage();tableHeader()}
  }
 })
 if(!rows.length){pdf.font('Helvetica').fontSize(9).fillColor('#737a75').text('Nenhum registro encontrado.',left,pdf.y+12)}
}
export function pdfReportTotal(pdf:PDFKit.PDFDocument,label:string,value:string){
 const left=36,width=770
 if(pdf.y+34>530)pdf.addPage()
 const y=pdf.y+10
 pdf.rect(left,y,width,24).fill('#eae6df')
 pdf.font('Helvetica-Bold').fontSize(9).fillColor('#303732').text(label,left+10,y+7,{width:500})
 pdf.text(value,left+510,y+7,{width:250,align:'right'})
 pdf.y=y+34
}
